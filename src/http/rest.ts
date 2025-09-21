import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WorkerBridge } from '../worker/bridge.js';
import { AppConfig } from '../config.js';
import { logger, getRecentLogs } from '../logging.js';
import { ProgressHub } from '../progress.js';
import { randomUUID } from 'node:crypto';
import { CommandSchemas, RunSeriesArgsSchema } from '../schemas.js';
import { z } from 'zod';

function mapError(error: unknown) {
  const err = error as Error & { code?: string };
  const code = err.code ?? 'UNKNOWN';
  switch (code) {
    case 'MODEL_STATE':
      return { status: 409, code };
    case 'IO':
      return { status: 400, code };
    case 'COM_ERROR':
      return { status: 502, code };
    default:
      return { status: 500, code: 'UNKNOWN' };
  }
}

function normalizeQuery(query: Request['query']) {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[value.length - 1] : value]),
  );
}

export function createRestApp(
  bridge: WorkerBridge,
  config: AppConfig,
  progressHub: ProgressHub,
) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cors({ origin: config.server.cors, credentials: false }));

  app.post('/api/project/connect', async (_req, res, next) => {
    try {
      await bridge.start();
      const args = CommandSchemas.connect?.parse({}) ?? {};
      const version = await bridge.request<{ version: string }>('connect', args);
      res.json({ ok: true, sessionId: randomUUID(), version: version?.version ?? 'unknown' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', details: error.errors } });
      } else {
        next(error);
      }
    }
  });

  app.post('/api/project/open', createCommandHandler(bridge, 'open'));
  app.post('/api/project/new-from-template', createCommandHandler(bridge, 'new_from_template'));
  app.post('/api/project/save', createCommandHandler(bridge, 'save'));
  app.post('/api/project/close', createCommandHandler(bridge, 'close'));

  app.post('/api/model/set-info', createCommandHandler(bridge, 'set_model_info'));
  app.post('/api/model/add-nodes', createCommandHandler(bridge, 'add_nodes'));
  app.post('/api/model/add-elements', createCommandHandler(bridge, 'add_elements'));

  app.post('/api/component/add-material', createCommandHandler(bridge, 'add_material'));
  app.post('/api/component/add-cross-section', createCommandHandler(bridge, 'add_cross_section'));
  app.post('/api/component/add-component', createCommandHandler(bridge, 'add_component'));
  app.post('/api/component/assign-property', createCommandHandler(bridge, 'assign_property'));

  app.post('/api/load/define-pattern', createCommandHandler(bridge, 'define_load_pattern'));
  app.post('/api/load/set-nodal', createCommandHandler(bridge, 'set_nodal_load'));

  app.post('/api/analysis/define-series', createCommandHandler(bridge, 'define_series'));
  app.post('/api/analysis/run-series', async (req, res, next) => {
    try {
      const progressToken = randomUUID();
      const args = RunSeriesArgsSchema.parse({ ...req.body, progressToken });
      const result = await bridge.request('run_series', args, config.limits.analysisTimeoutSec);
      res.json({ ok: true, result, progressToken });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', details: error.errors } });
      } else {
        next(error);
      }
    }
  });

  app.get('/api/results/:kind', async (req, res, next) => {
    const { kind } = req.params;
    const allowed = new Set([
      'nodeDisp',
      'supportReaction',
      'elementShear',
      'componentUsage',
      'pushoverCurve',
      'timeHistory',
    ]);
    if (!allowed.has(kind)) {
      res.status(404).json({ ok: false, error: 'UNKNOWN_RESULT_KIND' });
      return;
    }
    try {
      const params = normalizeQuery(req.query);
      const data = await bridge.request(`get_${toWorkerKey(kind)}`, params);
      res.json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/export/table', async (req, res, next) => {
    try {
      const params = normalizeQuery(req.query);
      const data = await bridge.request('export_table', params);
      res.json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/logs/recent', (_req, res) => {
    res.json({ ok: true, items: getRecentLogs() });
  });

  app.get('/api/progress/:token', (req, res) => {
    const { token } = req.params;
    progressHub.subscribe(token, res);
  });

  return app;
}

export function registerRestErrorHandler(app: express.Express) {
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ error }, 'REST handler error');
    const { status, code } = mapError(error);
    res.status(status).json({ ok: false, error: { code, message: (error as Error).message } });
  });
}

function toWorkerKey(kind: string) {
  switch (kind) {
    case 'nodeDisp':
      return 'node_disp';
    case 'supportReaction':
      return 'support_reaction';
    case 'elementShear':
      return 'element_shear';
    case 'componentUsage':
      return 'component_usage';
    case 'pushoverCurve':
      return 'pushover_curve';
    case 'timeHistory':
      return 'time_history';
    default:
      return kind;
  }
}

function createCommandHandler(bridge: WorkerBridge, command: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = CommandSchemas[command];
      const args = schema ? schema.parse(req.body ?? {}) : req.body ?? {};
      const data = await bridge.request(command, args);
      res.json({ ok: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', details: error.errors } });
      } else {
        next(error);
      }
    }
  };
}
