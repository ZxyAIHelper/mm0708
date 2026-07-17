import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AnonymousUser, TaskHistoryEnv } from './types'

export const SESSION_COOKIE = 'mm_anonymous_session'
const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type SessionRepository = {
    findBySessionHash(hash: string): Promise<AnonymousUser | null>
    create(user: AnonymousUser, hash: string): Promise<void>
    touch(userId: string, now: number): Promise<void>
}
function bytesToBase64Url(bytes: Uint8Array) {
    let binary = ''
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

export function createSessionToken() {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return bytesToBase64Url(bytes)
}

export async function hashSessionToken(token: string) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(token),
    )
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

export function createD1SessionRepository(
    db: D1Database,
): SessionRepository {
    return {
        async findBySessionHash(hash) {
            const row = await db.prepare(
                `SELECT id, created_at, last_seen_at
                 FROM anonymous_users
                 WHERE session_hash = ?`,
            ).bind(hash).first<{
                id: string
                created_at: number
                last_seen_at: number
            }>()
            return row
                ? {
                    id: row.id,
                    createdAt: row.created_at,
                    lastSeenAt: row.last_seen_at,
                }
                : null
        },
        async create(user, hash) {
            await db.prepare(
                `INSERT INTO anonymous_users
                 (id, session_hash, created_at, last_seen_at)
                 VALUES (?, ?, ?, ?)`,
            ).bind(
                user.id,
                hash,
                user.createdAt,
                user.lastSeenAt,
            ).run()
        },
        async touch(userId, now) {
            await db.prepare(
                `UPDATE anonymous_users
                 SET last_seen_at = ?
                 WHERE id = ?`,
            ).bind(now, userId).run()
        },
    }
}

type SessionContext = Context<{
    Bindings: TaskHistoryEnv
}>

function setSessionCookie(c: Context, token: string) {
    const hostname = new URL(c.req.url).hostname
    const isProduction = hostname === 'mm0708.top'
        || hostname.endsWith('.mm0708.top')
    setCookie(c, SESSION_COOKIE, token, {
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
        secure: isProduction,
        httpOnly: true,
        sameSite: 'Lax',
    })
}

export async function ensureAnonymousSession(
    c: SessionContext | Context,
    repository?: SessionRepository,
    now = Date.now(),
) {
    const resolvedRepository = repository
        ?? createD1SessionRepository(
            (c.env as TaskHistoryEnv).DB,
        )
    const cookieToken = getCookie(c, SESSION_COOKIE) ?? ''
    const headerToken = c.req.header('X-Browser-Session') ?? ''
    const candidates = [...new Set([cookieToken, headerToken])]
        .filter((token) => SESSION_TOKEN_PATTERN.test(token))

    for (const token of candidates) {
        const hash = await hashSessionToken(token)
        const existingUser = await resolvedRepository
            .findBySessionHash(hash)
        if (existingUser) {
            await resolvedRepository.touch(existingUser.id, now)
            if (token !== cookieToken) {
                setSessionCookie(c, token)
            }
            return { ...existingUser, lastSeenAt: now }
        }
    }

    const token = SESSION_TOKEN_PATTERN.test(headerToken)
        ? headerToken
        : createSessionToken()
    const hash = await hashSessionToken(token)
    const user: AnonymousUser = {
        id: `anon_${crypto.randomUUID()}`,
        createdAt: now,
        lastSeenAt: now,
    }
    try {
        await resolvedRepository.create(user, hash)
    } catch (error) {
        const concurrentUser = await resolvedRepository
            .findBySessionHash(hash)
        if (!concurrentUser) {
            throw error
        }
        await resolvedRepository.touch(concurrentUser.id, now)
        setSessionCookie(c, token)
        return { ...concurrentUser, lastSeenAt: now }
    }

    setSessionCookie(c, token)
    return user
}
