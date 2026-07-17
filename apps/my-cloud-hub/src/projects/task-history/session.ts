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

export async function ensureAnonymousSession(
    c: SessionContext | Context,
    repository?: SessionRepository,
    now = Date.now(),
) {
    const resolvedRepository = repository
        ?? createD1SessionRepository(
            (c.env as TaskHistoryEnv).DB,
        )
    const existingToken = getCookie(c, SESSION_COOKIE) ?? ''

    if (SESSION_TOKEN_PATTERN.test(existingToken)) {
        const hash = await hashSessionToken(existingToken)
        const existingUser = await resolvedRepository
            .findBySessionHash(hash)
        if (existingUser) {
            await resolvedRepository.touch(existingUser.id, now)
            return { ...existingUser, lastSeenAt: now }
        }
    }

    const token = createSessionToken()
    const user: AnonymousUser = {
        id: `anon_${crypto.randomUUID()}`,
        createdAt: now,
        lastSeenAt: now,
    }
    await resolvedRepository.create(
        user,
        await hashSessionToken(token),
    )

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
    return user
}
