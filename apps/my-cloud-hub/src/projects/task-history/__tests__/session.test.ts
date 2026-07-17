import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
    ensureAnonymousSession,
    type SessionRepository,
} from '../session'

function createRepository() {
    const users = new Map<string, {
        id: string
        createdAt: number
        lastSeenAt: number
    }>()
    const repository: SessionRepository = {
        findBySessionHash: async (hash) => users.get(hash) ?? null,
        create: async (user, hash) => {
            users.set(hash, user)
        },
        touch: async (id, now) => {
            for (const user of users.values()) {
                if (user.id === id) {
                    user.lastSeenAt = now
                }
            }
        },
    }
    return { repository, users }
}

function createApp(repository: SessionRepository) {
    const app = new Hono()
    app.post('/session', async (c) => {
        const user = await ensureAnonymousSession(c, repository, 1000)
        return c.json({ userId: user.id })
    })
    return app
}

function cookiePair(setCookie: string) {
    return setCookie.split(';', 1)[0]
}

describe('anonymous browser session', () => {
    it('creates a secure host-only cookie in production', async () => {
        const { repository, users } = createRepository()
        const response = await createApp(repository).request(
            'https://api.mm0708.top/session',
            { method: 'POST' },
        )
        const data = await response.json() as { userId: string }
        const setCookie = response.headers.get('Set-Cookie') ?? ''

        expect(data.userId).toMatch(/^anon_/)
        expect(users.size).toBe(1)
        expect([...users.keys()][0]).toMatch(/^[a-f0-9]{64}$/)
        expect(setCookie).toContain('mm_anonymous_session=')
        expect(setCookie).not.toContain('Domain=')
        expect(setCookie).toContain('Max-Age=31536000')
        expect(setCookie).toContain('HttpOnly')
        expect(setCookie).toContain('Secure')
        expect(setCookie).toContain('SameSite=Lax')
    })

    it('reuses the same user for a known cookie', async () => {
        const { repository, users } = createRepository()
        const app = createApp(repository)
        const first = await app.request(
            'https://api.mm0708.top/session',
            { method: 'POST' },
        )
        const cookie = cookiePair(first.headers.get('Set-Cookie') ?? '')
        const firstData = await first.json() as { userId: string }
        const second = await app.request(
            'https://api.mm0708.top/session',
            { method: 'POST', headers: { Cookie: cookie } },
        )
        const secondData = await second.json() as { userId: string }

        expect(secondData.userId).toBe(firstData.userId)
        expect(users.size).toBe(1)
        expect(second.headers.has('Set-Cookie')).toBe(false)
    })

    it('rotates an invalid cookie and uses a host-only local cookie', async () => {
        const { repository } = createRepository()
        const response = await createApp(repository).request(
            'http://localhost/session',
            {
                method: 'POST',
                headers: { Cookie: 'mm_anonymous_session=invalid' },
            },
        )
        const setCookie = response.headers.get('Set-Cookie') ?? ''

        expect(setCookie).toContain('mm_anonymous_session=')
        expect(setCookie).not.toContain('Domain=')
        expect(setCookie).not.toContain('Secure')
        expect(setCookie).toContain('HttpOnly')
    })
})
