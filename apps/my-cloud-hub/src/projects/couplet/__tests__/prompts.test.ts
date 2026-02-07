import { describe, it, expect } from 'vitest';
import promptRouter from '../prompts';

describe('Prompts API', () => {
    it('should return all prompts on GET /api/couplet/prompts', async () => {
        const req = new Request('http://localhost/api/couplet/prompts');
        const res = await promptRouter.fetch(req);

        expect(res.status).toBe(200);
        const data = await res.json();

        // Verify it returns the expected prompt types
        expect(data).toHaveProperty('system');
        expect(data).toHaveProperty('couple');
        expect(data).toHaveProperty('child');
    });

    it('should save a prompt on POST /api/couplet/prompts', async () => {
        const req = new Request('http://localhost/api/couplet/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'system',
                content: 'Test prompt content'
            })
        });

        const res = await promptRouter.fetch(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
    });

    it('should return 400 for invalid prompt type', async () => {
        const req = new Request('http://localhost/api/couplet/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'invalid',
                content: 'Test'
            })
        });

        const res = await promptRouter.fetch(req);
        expect(res.status).toBe(400);
    });

    it('should return 400 for missing content', async () => {
        const req = new Request('http://localhost/api/couplet/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'system'
            })
        });

        const res = await promptRouter.fetch(req);
        expect(res.status).toBe(400);
    });
});
