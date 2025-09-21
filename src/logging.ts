import pino, { Logger } from 'pino';

export type LogEntry = {
  level: pino.LevelWithSilent;
  time: string;
  message: string;
  context?: Record<string, unknown>;
};

class LogBuffer {
  private readonly entries: LogEntry[] = [];
  constructor(private readonly capacity: number) {}

  push(entry: LogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  list(): LogEntry[] {
    return [...this.entries];
  }
}

const buffer = new LogBuffer(200);

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: () => `"time":"${new Date().toISOString()}"`,
});

function record(level: pino.LevelWithSilent, message: string, context?: Record<string, unknown>) {
  buffer.push({ level, time: new Date().toISOString(), message, context });
}

function log(level: pino.LevelWithSilent, contextOrMessage?: Record<string, unknown> | string, maybeMessage?: string) {
  if (typeof contextOrMessage === 'string' || contextOrMessage === undefined) {
    const msg = contextOrMessage ?? '';
    baseLogger[level](msg);
    record(level, msg);
  } else {
    baseLogger[level](contextOrMessage, maybeMessage ?? '');
    record(level, maybeMessage ?? '', contextOrMessage);
  }
}

export const logger = {
  fatal: (context?: Record<string, unknown> | string, message?: string) => log('fatal', context, message),
  error: (context?: Record<string, unknown> | string, message?: string) => log('error', context, message),
  warn: (context?: Record<string, unknown> | string, message?: string) => log('warn', context, message),
  info: (context?: Record<string, unknown> | string, message?: string) => log('info', context, message),
  debug: (context?: Record<string, unknown> | string, message?: string) => log('debug', context, message),
};

export function getRecentLogs() {
  return buffer.list();
}
