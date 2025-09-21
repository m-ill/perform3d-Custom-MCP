import type { Response } from 'express';
import { WorkerProgress } from './worker/bridge.js';

type ProgressCallback = (event: WorkerProgress) => void;

export class ProgressHub {
  private readonly sseListeners = new Map<string, Set<Response>>();
  private readonly callbacks = new Map<string, Set<ProgressCallback>>();

  subscribe(token: string, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const set = this.sseListeners.get(token) ?? new Set<Response>();
    set.add(res);
    this.sseListeners.set(token, set);

    res.write(': ok\n\n');
    const interval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(interval);
      this.removeSseListener(token, res);
    });

    return () => {
      clearInterval(interval);
      this.removeSseListener(token, res);
      res.end();
    };
  }

  register(token: string, callback: ProgressCallback) {
    const set = this.callbacks.get(token) ?? new Set<ProgressCallback>();
    set.add(callback);
    this.callbacks.set(token, set);
    return () => {
      const current = this.callbacks.get(token);
      if (!current) return;
      current.delete(callback);
      if (current.size === 0) {
        this.callbacks.delete(token);
      }
    };
  }

  publish(event: WorkerProgress) {
    const sseSet = this.sseListeners.get(event.token);
    if (sseSet) {
      const payload = JSON.stringify(event);
      for (const res of sseSet) {
        res.write(`event: progress\n`);
        res.write(`data: ${payload}\n\n`);
      }
      if (event.stage === 'done') {
        for (const res of sseSet) {
          res.end();
        }
        this.sseListeners.delete(event.token);
      }
    }

    const callbackSet = this.callbacks.get(event.token);
    if (callbackSet) {
      for (const callback of callbackSet) {
        callback(event);
      }
      if (event.stage === 'done') {
        this.callbacks.delete(event.token);
      }
    }
  }

  private removeSseListener(token: string, res: Response) {
    const set = this.sseListeners.get(token);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) {
      this.sseListeners.delete(token);
    }
  }
}
