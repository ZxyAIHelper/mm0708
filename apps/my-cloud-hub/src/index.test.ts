import { describe, expect, it } from 'vitest'
import { createApp, isTrustedOrigin } from './index'

describe('worker task history wiring', () => {
    it('accepts owned domains and local development origins', () => {
        expect(isTrustedOrigin(
            'https://product-swap.mm0708.top',
        )).toBe(true)
        expect(isTrustedOrigin('http://localhost:8791')).toBe(true)
        expect(isTrustedOrigin('http://127.0.0.1:4173')).toBe(true)
        expect(isTrustedOrigin(
            'https://untrusted.mm0708.top',
        )).toBe(false)
        expect(isTrustedOrigin('https://evil.example')).toBe(false)
    })

    it('returns credentialed CORS headers for a trusted origin', async () => {
        const response = await createApp().request(
            '/api/tasks/session',
            {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://product-swap.mm0708.top',
                    'Access-Control-Request-Method': 'POST',
                },
            },
        )

        expect(response.status).toBe(204)
        expect(response.headers.get('Access-Control-Allow-Origin'))
            .toBe('https://product-swap.mm0708.top')
        expect(response.headers.get('Access-Control-Allow-Credentials'))
            .toBe('true')
    })

    it('does not grant CORS access to an unrelated origin', async () => {
        const response = await createApp().request('/', {
            headers: { Origin: 'https://evil.example' },
        })
        expect(response.headers.get('Access-Control-Allow-Origin'))
            .toBeNull()
    })

    it('blocks untrusted sibling origins only on private task routes', async () => {
        const privateResponse = await createApp().request('/api/tasks', {
            headers: { Origin: 'https://untrusted.mm0708.top' },
        })
        const legacyResponse = await createApp().request('/', {
            headers: { Origin: 'https://untrusted.mm0708.top' },
        })

        expect(privateResponse.status).toBe(403)
        expect(privateResponse.headers.get('Access-Control-Allow-Origin'))
            .toBeNull()
        expect(legacyResponse.headers.get('Access-Control-Allow-Origin'))
            .toBe('https://untrusted.mm0708.top')
    })
})
