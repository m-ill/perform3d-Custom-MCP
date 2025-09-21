import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, '..');
const configSchema = z.object({
    perform3d: z.object({
        visible: z.boolean().default(false),
    }),
    unitsDefault: z.object({
        force: z.string(),
        length: z.string(),
    }),
    paths: z.object({
        templates: z.string(),
        work: z.string(),
    }),
    server: z.object({
        host: z.string(),
        port: z.number(),
        cors: z.array(z.string()).default([]),
    }),
    limits: z.object({
        analysisTimeoutSec: z.number().positive(),
        commandTimeoutSec: z.number().positive(),
    }),
    worker: z.object({
        command: z.string().default(''),
        args: z.array(z.string()).default([]),
    }).partial().default({}),
});
function loadFile(relativePath) {
    try {
        const absolutePath = resolve(projectRoot, 'config', relativePath);
        const raw = readFileSync(absolutePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}
function mergeConfig(base, override) {
    if (Array.isArray(base) || Array.isArray(override)) {
        return override ?? base;
    }
    if (typeof base === 'object' && base !== null && typeof override === 'object' && override !== null) {
        const result = { ...base };
        for (const [key, value] of Object.entries(override)) {
            if (value === undefined)
                continue;
            const current = base[key];
            result[key] = mergeConfig(current, value);
        }
        return result;
    }
    return override ?? base;
}
export function loadConfig() {
    const defaultConfig = loadFile('default.json');
    const localConfig = loadFile('local.json');
    const merged = mergeConfig(defaultConfig, localConfig);
    const envOverride = process.env.P3D_MCP_CONFIG;
    const envConfig = envOverride ? JSON.parse(envOverride) : {};
    const finalConfig = mergeConfig(merged, envConfig);
    const parsed = configSchema.parse(finalConfig);
    if (!parsed.worker?.command) {
        const defaultWorkerPath = resolve(projectRoot, 'worker', 'Perform3D.Worker.exe');
        parsed.worker = {
            command: defaultWorkerPath,
            args: [],
        };
    }
    return parsed;
}
