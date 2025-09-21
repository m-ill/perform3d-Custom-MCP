import http from 'node:http';
import { loadConfig } from './config.js';
import { logger } from './logging.js';
import { WorkerBridge } from './worker/bridge.js';
import { ProgressHub } from './progress.js';
import { createRestApp, registerRestErrorHandler } from './http/rest.js';
import { registerStreamableMcp } from './mcp/streamable.js';

async function bootstrap() {
  const config = loadConfig();
  const bridge = new WorkerBridge(config);
  const progressHub = new ProgressHub();

  bridge.on('progress', (event) => {
    progressHub.publish(event);
  });

  const app = createRestApp(bridge, config, progressHub);
  registerStreamableMcp(app, bridge, progressHub, config);
  registerRestErrorHandler(app);

  const server = http.createServer(app);
  server.listen(config.server.port, config.server.host, () => {
    logger.info({ host: config.server.host, port: config.server.port }, 'Perform3D MCP server listening');
  });

  const shutdown = async () => {
    logger.info('Shutting down Perform3D MCP server');
    server.close();
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
}

bootstrap().catch((error) => {
  logger.fatal({ error }, 'Failed to bootstrap Perform3D MCP server');
  process.exit(1);
});
