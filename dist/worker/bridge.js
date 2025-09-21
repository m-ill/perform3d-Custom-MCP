import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import { loadConfig } from '../config.js';
import { logger } from '../logging.js';
export class WorkerBridge extends EventEmitter {
    config;
    child;
    pending = new Map();
    shuttingDown = false;
    constructor(config) {
        super();
        this.config = config ?? loadConfig();
    }
    async start() {
        if (this.child && !this.child.killed) {
            return;
        }
        await this.spawnWorker();
    }
    async spawnWorker() {
        const { worker } = this.config;
        if (!worker?.command) {
            throw new Error('Worker command is not configured');
        }
        const args = worker.args ?? [];
        logger.info({ command: worker.command, args }, 'Starting Perform3D worker process');
        this.child = spawn(worker.command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child.once('error', (error) => {
            logger.error({ error }, 'Perform3D worker process error');
            this.failAllPending(new Error(`Worker process error: ${error.message}`));
        });
        this.child.once('exit', (code, signal) => {
            if (this.shuttingDown)
                return;
            logger.error({ code, signal }, 'Perform3D worker process exited unexpectedly');
            this.failAllPending(new Error('Worker process exited unexpectedly'));
            this.child = undefined;
        });
        const rl = createInterface({
            input: this.child.stdout,
            crlfDelay: Infinity,
        });
        rl.on('line', (line) => {
            this.handleLine(line);
        });
        const stderrRl = createInterface({
            input: this.child.stderr,
            crlfDelay: Infinity,
        });
        stderrRl.on('line', (line) => {
            logger.warn({ source: 'worker-stderr', line }, 'Worker stderr output');
        });
        await once(this.child, 'spawn');
    }
    handleLine(line) {
        if (!line.trim())
            return;
        let envelope;
        try {
            envelope = JSON.parse(line);
        }
        catch (error) {
            logger.error({ line, error }, 'Failed to parse worker response');
            return;
        }
        if ('type' in envelope) {
            if (envelope.type === 'progress') {
                this.emit('progress', envelope);
            }
            else if (envelope.type === 'log') {
                const level = envelope.level ?? 'info';
                const context = envelope.context ?? {};
                switch (level) {
                    case 'debug':
                        logger.debug(context, envelope.message);
                        break;
                    case 'warn':
                        logger.warn(context, envelope.message);
                        break;
                    case 'error':
                        logger.error(context, envelope.message);
                        break;
                    default:
                        logger.info(context, envelope.message);
                        break;
                }
            }
            return;
        }
        if (!('id' in envelope)) {
            logger.warn({ envelope }, 'Worker response missing id');
            return;
        }
        const pending = this.pending.get(envelope.id);
        if (!pending) {
            logger.warn({ id: envelope.id }, 'Received response for unknown request');
            return;
        }
        clearTimeout(pending.timeout);
        this.pending.delete(envelope.id);
        if (envelope.ok) {
            pending.resolve(envelope.data ?? null);
        }
        else {
            const message = envelope.error?.message ?? 'Worker reported an error';
            const commandError = new Error(message);
            commandError.code = envelope.error?.code ?? 'UNKNOWN';
            pending.reject(commandError);
        }
    }
    failAllPending(error) {
        for (const [id, pending] of this.pending.entries()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
            this.pending.delete(id);
        }
    }
    async stop() {
        this.shuttingDown = true;
        if (this.child && !this.child.killed) {
            this.child.kill();
            await once(this.child, 'exit').catch(() => undefined);
        }
    }
    async request(cmd, args = {}, timeoutSec) {
        await this.start();
        const child = this.child;
        if (!child || !child.stdin.writable) {
            throw new Error('Worker process is not available');
        }
        const id = randomUUID();
        const envelope = { id, cmd, args };
        const payload = JSON.stringify(envelope);
        const timeoutMs = (timeoutSec ?? this.config.limits.commandTimeoutSec) * 1000;
        const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Worker command timed out after ${timeoutMs} ms`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve: resolve,
                reject,
                timeout,
            });
        });
        child.stdin.write(`${payload}\n`);
        return promise;
    }
}
