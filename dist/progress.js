export class ProgressHub {
    sseListeners = new Map();
    callbacks = new Map();
    subscribe(token, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        const set = this.sseListeners.get(token) ?? new Set();
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
    register(token, callback) {
        const set = this.callbacks.get(token) ?? new Set();
        set.add(callback);
        this.callbacks.set(token, set);
        return () => {
            const current = this.callbacks.get(token);
            if (!current)
                return;
            current.delete(callback);
            if (current.size === 0) {
                this.callbacks.delete(token);
            }
        };
    }
    publish(event) {
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
    removeSseListener(token, res) {
        const set = this.sseListeners.get(token);
        if (!set)
            return;
        set.delete(res);
        if (set.size === 0) {
            this.sseListeners.delete(token);
        }
    }
}
