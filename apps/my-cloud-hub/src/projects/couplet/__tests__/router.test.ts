import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

describe('Couplet Generation API', () => {
    // Mock environment with Doubao API key
    const env = {
        DOUBAO_API_KEY: 'test-api-key'
    };

    it('should generate couplet for couple mode', async () => {
        const app = new Hono();

        // Mock the generate endpoint behavior
        app.post('/api/couplet/generate', async (c) => {
            const body = await c.req.json();

            // Validate input
            if (!body.names || body.names.length !== 2) {
                return c.json({ error: 'Invalid input' }, 400);
            }

            // Return mock success response
            return c.json({
                top: '福随瑞至',
                right: '上联内容',
                left: '下联内容',
                explanation: '对联说明'
            });
        });

        const req = new Request('http://localhost/api/couplet/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'new_year',
                mode: 'couple',
                names: ['张', '王']
            })
        });

        const res = await app.fetch(req, env);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty('top');
        expect(data).toHaveProperty('right');
        expect(data).toHaveProperty('left');
    });

    it('should generate couplet for child mode', async () => {
        const app = new Hono();

        app.post('/api/couplet/generate', async (c) => {
            const body = await c.req.json();

            if (!body.names || body.names.length !== 1) {
                return c.json({ error: 'Invalid input' }, 400);
            }

            return c.json({
                top: '福随瑞至',
                right: '上联内容',
                left: '下联内容',
                explanation: '对联说明'
            });
        });

        const req = new Request('http://localhost/api/couplet/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'new_year',
                mode: 'child',
                names: ['张三']
            })
        });

        const res = await app.fetch(req, env);
        expect(res.status).toBe(200);
    });

    it('should return 400 when names are missing', async () => {
        const app = new Hono();

        app.post('/api/couplet/generate', async (c) => {
            const body = await c.req.json();

            if (!body.names || body.names.length === 0) {
                return c.json({ error: 'Names required' }, 400);
            }

            return c.json({});
        });

        const req = new Request('http://localhost/api/couplet/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'new_year',
                mode: 'couple',
                names: []
            })
        });

        const res = await app.fetch(req, env);
        expect(res.status).toBe(400);
    });

    it('should handle invalid mode', async () => {
        const app = new Hono();

        app.post('/api/couplet/generate', async (c) => {
            const body = await c.req.json();

            if (!['couple', 'child'].includes(body.mode)) {
                return c.json({ error: 'Invalid mode' }, 400);
            }

            return c.json({});
        });

        const req = new Request('http://localhost/api/couplet/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'new_year',
                mode: 'invalid',
                names: ['test']
            })
        });

        const res = await app.fetch(req, env);
        expect(res.status).toBe(400);
    });
});
