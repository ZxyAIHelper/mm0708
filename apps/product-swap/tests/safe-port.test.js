const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { listenOnSafePort } = require('./safe-port');

class FakeServer extends EventEmitter {
    constructor(results) {
        super();
        this.results = [...results];
        this.attempts = [];
        this.boundPort = null;
    }

    listen(port, host) {
        this.attempts.push({ port, host });
        const result = this.results.shift();
        queueMicrotask(() => {
            if (result instanceof Error) {
                this.emit('error', result);
                return;
            }
            this.boundPort = port;
            this.emit('listening');
        });
    }

    address() {
        return {
            address: '127.0.0.1',
            family: 'IPv4',
            port: this.boundPort,
        };
    }
}

test('retries a different safe high port after EADDRINUSE', async () => {
    const inUse = Object.assign(new Error('occupied'), {
        code: 'EADDRINUSE',
    });
    const server = new FakeServer([inUse, null]);
    const randomValues = [0, 0.5];

    const address = await listenOnSafePort(server, {
        minPort: 20000,
        maxPort: 45000,
        random: () => randomValues.shift(),
    });

    assert.deepEqual(server.attempts, [
        { port: 20000, host: '127.0.0.1' },
        { port: 32500, host: '127.0.0.1' },
    ]);
    assert.equal(address.port, 32500);
});

test('rejects a non-address-conflict error without retrying', async () => {
    const denied = Object.assign(new Error('denied'), {
        code: 'EACCES',
    });
    const server = new FakeServer([denied]);

    await assert.rejects(
        listenOnSafePort(server, { random: () => 0 }),
        denied,
    );
    assert.equal(server.attempts.length, 1);
});
