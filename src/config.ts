import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, '..');

const configSchema = z.object({
  perform3d: z.object({
    installPath: z.string(),
    visible: z.boolean().default(false),
    maxInstances: z.number().default(1),
    startupTimeout: z.number().default(30000),
  }),
  unitsDefault: z.object({
    force: z.string(),
    length: z.string(),
  }),
  paths: z.object({
    templates: z.string(),
    work: z.string(),
    exports: z.string().optional(),
    logs: z.string().optional(),
  }),
  server: z.object({
    host: z.string(),
    port: z.number(),
    cors: z.array(z.string()).default([]),
    maxRequestSize: z.string().default('5mb'),
  }),
  limits: z.object({
    analysisTimeoutSec: z.number().positive(),
    commandTimeoutSec: z.number().positive(),
    maxNodes: z.number().positive().optional(),
    maxElements: z.number().positive().optional(),
    maxLoadCases: z.number().positive().optional(),
  }),
  worker: z.object({
    executable: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    restartOnError: z.boolean().default(true),
    maxRestarts: z.number().default(3),
    healthCheckInterval: z.number().default(60000),
  }).partial().default({}),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    maxFiles: z.number().default(10),
    maxSizeMB: z.number().default(50),
  }).optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

function loadFile(relativePath: string): unknown {
  try {
    const absolutePath = resolve(projectRoot, 'config', relativePath);
    const raw = readFileSync(absolutePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function mergeConfig(base: unknown, override: unknown): unknown {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override ?? base;
  }
  if (typeof base === 'object' && base !== null && typeof override === 'object' && override !== null) {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) continue;
      const current = (base as Record<string, unknown>)[key];
      result[key] = mergeConfig(current, value);
    }
    return result;
  }
  return override ?? base;
}

function validateAndPreparePaths(config: AppConfig): void {
  // Validate Perform3D installation
  const installPath = config.perform3d.installPath;
  if (!existsSync(installPath)) {
    console.warn(`Warning: Perform3D installation path does not exist: ${installPath}`);
    console.warn('Please ensure Perform3D v10 is installed or update the config.');
  }

  // Create required directories if they don't exist
  const requiredPaths = [
    config.paths.templates,
    config.paths.work,
    config.paths.exports,
    config.paths.logs,
  ];

  for (const path of requiredPaths) {
    if (path && !existsSync(path)) {
      try {
        mkdirSync(path, { recursive: true });
        console.log(`Created directory: ${path}`);
      } catch (error) {
        console.error(`Failed to create directory ${path}:`, error);
      }
    }
  }

  // Validate worker executable
  if (config.worker.executable) {
    const workerPath = resolve(projectRoot, config.worker.executable);
    if (!existsSync(workerPath)) {
      console.warn(`Warning: Worker executable not found: ${workerPath}`);
      console.warn('Please build the C# worker project first.');
    }
  }
}

export function loadConfig(): AppConfig {
  const defaultConfig = loadFile('default.json');
  const localConfig = loadFile('local.json');
  const merged = mergeConfig(defaultConfig, localConfig);

  const envOverride = process.env.P3D_MCP_CONFIG;
  const envConfig = envOverride ? JSON.parse(envOverride) : {};

  const finalConfig = mergeConfig(merged, envConfig);
  const parsed = configSchema.parse(finalConfig);

  // Set default worker path if not specified
  if (!parsed.worker?.command && !parsed.worker?.executable) {
    const defaultWorkerPath = resolve(projectRoot, 'worker', 'Perform3D.Worker.exe');
    parsed.worker = {
      ...parsed.worker,
      command: defaultWorkerPath,
      executable: './worker/Perform3D.Worker.exe',
      args: [],
    };
  } else if (parsed.worker?.executable && !parsed.worker?.command) {
    parsed.worker.command = resolve(projectRoot, parsed.worker.executable);
  }

  // Set default paths if not specified
  if (!parsed.paths.exports) {
    parsed.paths.exports = resolve(parsed.paths.work, 'exports');
  }
  if (!parsed.paths.logs) {
    parsed.paths.logs = resolve(parsed.paths.work, 'logs');
  }

  // Validate and prepare filesystem
  validateAndPreparePaths(parsed);

  return parsed;
}