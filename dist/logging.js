import pino from 'pino';
class LogBuffer {
    capacity;
    entries = [];
    constructor(capacity) {
        this.capacity = capacity;
    }
    push(entry) {
        this.entries.push(entry);
        if (this.entries.length > this.capacity) {
            this.entries.shift();
        }
    }
    list() {
        return [...this.entries];
    }
}
const buffer = new LogBuffer(200);
const baseLogger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    timestamp: () => `"time":"${new Date().toISOString()}"`,
});
function record(level, message, context) {
    buffer.push({ level, time: new Date().toISOString(), message, context });
}
function log(level, contextOrMessage, maybeMessage) {
    if (typeof contextOrMessage === 'string' || contextOrMessage === undefined) {
        const msg = contextOrMessage ?? '';
        baseLogger[level](msg);
        record(level, msg);
    }
    else {
        baseLogger[level](contextOrMessage, maybeMessage ?? '');
        record(level, maybeMessage ?? '', contextOrMessage);
    }
}
export const logger = {
    fatal: (context, message) => log('fatal', context, message),
    error: (context, message) => log('error', context, message),
    warn: (context, message) => log('warn', context, message),
    info: (context, message) => log('info', context, message),
    debug: (context, message) => log('debug', context, message),
};
export function getRecentLogs() {
    return buffer.list();
}
