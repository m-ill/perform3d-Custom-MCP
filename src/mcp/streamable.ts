import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WorkerBridge } from '../worker/bridge.js';
import { ProgressHub } from '../progress.js';
import { AppConfig } from '../config.js';
import { CommandSchemas } from '../schemas.js';
import { z } from 'zod';

const TOOL_MAP: Record<string, string> = {
  connect: 'connect',
  openModel: 'open',
  newFromTemplate: 'new_from_template',
  save: 'save',
  close: 'close',
  setModelInfo: 'set_model_info',
  addNodes: 'add_nodes',
  addElements: 'add_elements',
  addMaterial: 'add_material',
  addCrossSection: 'add_cross_section',
  addComponent: 'add_component',
  assignProperty: 'assign_property',
  defineLoadPattern: 'define_load_pattern',
  setNodalLoad: 'set_nodal_load',
  defineAnalysisSeries: 'define_series',
  runSeries: 'run_series',
  getResults_nodeDisp: 'get_node_disp',
  getResults_supportReaction: 'get_support_reaction',
  getResults_elementShear: 'get_element_shear',
  getResults_componentUsage: 'get_component_usage',
  getResults_pushoverCurve: 'get_pushover_curve',
  getResults_timeHistory: 'get_time_history',
  export_table: 'export_table',
};

const TOOL_DEFINITIONS = [
  { name: 'connect', description: 'Initialise connection to Perform3D worker' },
  { name: 'openModel', description: 'Open an existing Perform3D model file' },
  { name: 'newFromTemplate', description: 'Create new model from template and save as target path' },
  { name: 'save', description: 'Save current model' },
  { name: 'close', description: 'Close current model' },
  { name: 'setModelInfo', description: 'Set model units and basic info' },
  { name: 'addNodes', description: 'Add nodes including restraints and mass values' },
  { name: 'addElements', description: 'Add elements referencing groups and properties' },
  { name: 'addMaterial', description: 'Define material' },
  { name: 'addCrossSection', description: 'Define cross section' },
  { name: 'addComponent', description: 'Define elastic/inelastic/compound component' },
  { name: 'assignProperty', description: 'Assign component property to elements' },
  { name: 'defineLoadPattern', description: 'Create load pattern' },
  { name: 'setNodalLoad', description: 'Apply nodal load values' },
  { name: 'defineAnalysisSeries', description: 'Define analysis series sequence' },
  { name: 'runSeries', description: 'Run analysis series with progress reporting' },
  { name: 'getResults.nodeDisp', description: 'Retrieve nodal displacement results' },
  { name: 'getResults.supportReaction', description: 'Retrieve support reaction results' },
  { name: 'getResults.elementShear', description: 'Retrieve element shear results' },
  { name: 'getResults.componentUsage', description: 'Retrieve component usage ratios' },
  { name: 'getResults.pushoverCurve', description: 'Retrieve pushover capacity curve' },
  { name: 'getResults.timeHistory', description: 'Retrieve time-history data (disp/accel/shear)' },
  { name: 'export.table', description: 'Export tables via worker (CSV/JSON)' },
];

export function registerStreamableMcp(
  app: express.Express,
  bridge: WorkerBridge,
  _progressHub: ProgressHub,
  config: AppConfig,
) {
  const transports: Map<string, { transport: StreamableHTTPServerTransport; server: Server }> = new Map();

  function createServerInstance() {
    const server = new Server(
      {
        name: 'perform3d-mcp',
        title: 'Perform3D MCP Server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions:
          'Automation bridge for Perform3D v10 tutorial pipeline (units kN/cm). Tools mirror the documented workflow.',
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS.map((tool) => ({ name: tool.name, description: tool.description })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const commandKey = mapToolName(name);
      const toolArgs = (args ?? {}) as Record<string, unknown>;
      if (!commandKey) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
      }

      if (commandKey === 'connect') {
        try {
          const schema = CommandSchemas.connect;
          const validatedArgs = schema ? schema.parse({}) : {};
          const result = await bridge.request('connect', validatedArgs);
          return asJsonContent(result);
        } catch (error) {
          if (error instanceof z.ZodError) {
            return asJsonContent({ ok: false, error: 'VALIDATION_ERROR', details: error.errors });
          }
          throw error;
        }
      }

      if (commandKey === 'run_series') {
        try {
          const meta = toolArgs._meta as Record<string, unknown> | undefined;
          const maybeToken = meta?.progressToken;
          const progressToken = typeof maybeToken === 'string'
            ? maybeToken
            : maybeToken !== undefined
              ? String(maybeToken)
              : randomUUID();

          const payload = { ...toolArgs, progressToken };
          delete (payload as Record<string, unknown>)._meta;

          const schema = CommandSchemas[commandKey];
          const validatedPayload = schema ? schema.parse(payload) : payload;
          const result = await bridge.request(commandKey, validatedPayload, config.limits.analysisTimeoutSec);
          return asJsonContent({ ok: true, progressToken, result });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return asJsonContent({ ok: false, error: 'VALIDATION_ERROR', details: error.errors });
          }
          throw error;
        }
      }

      try {
        const schema = CommandSchemas[commandKey];
        const validatedArgs = schema ? schema.parse(toolArgs) : toolArgs;
        const result = await bridge.request(commandKey, validatedArgs);
        return asJsonContent(result ?? { ok: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return asJsonContent({ ok: false, error: 'VALIDATION_ERROR', details: error.errors });
        }
        throw error;
      }
    });

    return server;
  }

  function mapToolName(name: string) {
    if (name.startsWith('getResults.')) {
      const suffix = name.split('.').slice(1).join('_');
      return TOOL_MAP[`getResults_${suffix}`];
    }
    if (name === 'export.table') {
      return TOOL_MAP['export_table'];
    }
    return TOOL_MAP[name];
  }

  function asJsonContent(data: unknown) {
    return {
      content: [
        {
          type: 'json',
          json: data,
        },
      ],
    };
  }

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const existing = transports.get(sessionId)!;
      await existing.transport.handleRequest(req, res);
      return;
    }

    const server = createServerInstance();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      eventStore: undefined,
      onsessioninitialized: (sid: string) => {
        transports.set(sid, { server, transport });
      },
    });

    server.onclose = async () => {
      const sid = transport.sessionId;
      if (sid && transports.has(sid)) {
        transports.delete(sid);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: req.body?.id,
      });
      return;
    }
    const { transport } = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: req.body?.id,
      });
      return;
    }

    const { transport, server } = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    await server.close();
    transports.delete(sessionId);
  });
}
