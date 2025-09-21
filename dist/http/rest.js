import express from 'express';
import cors from 'cors';
import { logger, getRecentLogs } from '../logging.js';
import { randomUUID } from 'node:crypto';
function mapError(error) {
    const err = error;
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
function normalizeQuery(query) {
    return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, Array.isArray(value) ? value[value.length - 1] : value]));
}
export function createRestApp(bridge, config, progressHub) {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(cors({ origin: config.server.cors, credentials: false }));
    app.post('/api/project/connect', async (_req, res, next) => {
        try {
            await bridge.start();
            const version = await bridge.request('connect', { visible: config.perform3d.visible });
            res.json({ ok: true, sessionId: randomUUID(), version: version?.version ?? 'unknown' });
        }
        catch (error) {
            next(error);
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
        const progressToken = req.body?._meta?.progressToken || randomUUID();
        try {
            const result = await bridge.request('run_series', { ...req.body, progressToken }, config.limits.analysisTimeoutSec);
            res.json({ ok: true, result, progressToken });
        }
        catch (error) {
            next(error);
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
        }
        catch (error) {
            next(error);
        }
    });
    app.get('/api/export/table', async (req, res, next) => {
        try {
            const params = normalizeQuery(req.query);
            const data = await bridge.request('export_table', params);
            res.json({ ok: true, data });
        }
        catch (error) {
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
export function registerRestErrorHandler(app) {
    app.use((error, _req, res, _next) => {
        logger.error({ error }, 'REST handler error');
        const { status, code } = mapError(error);
        res.status(status).json({ ok: false, error: { code, message: error.message } });
    });
}
function toWorkerKey(kind) {
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
function createCommandHandler(bridge, command) {
    return async (req, res, next) => {
        try {
            const data = await bridge.request(command, req.body ?? {});
            res.json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    };
}
