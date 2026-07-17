import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createTaskHistoryRouter } from '../router'
import type {
    AnonymousUser,
    TaskHistoryService,
    TaskPage,
} from '../types'

const user: AnonymousUser = {
    id: 'anon_user_a',
    createdAt: 1,
    lastSeenAt: 1,
}

function createService(overrides: Partial<TaskHistoryService> = {}) {
    const emptyPage: TaskPage = { tasks: [], nextCursor: null }
    return {
        startTask: async () => { throw new Error('unused') },
        archiveDataUrl: async () => { throw new Error('unused') },
        archiveRemoteImage: async () => { throw new Error('unused') },
        completeTask: async () => undefined,
        failTask: async () => undefined,
        listTasks: async () => emptyPage,
        getTask: async () => null,
        getAsset: async () => null,
        deleteTask: async () => false,
        cleanupExpiredAssets: async () => 0,
        ...overrides,
    } satisfies TaskHistoryService
}

function createApp(service: TaskHistoryService) {
    const app = new Hono()
    app.route('/api/tasks', createTaskHistoryRouter({
        resolveUser: async () => user,
        resolveService: () => service,
    }))
    return app
}

describe('task history router', () => {
    it('returns the current anonymous session', async () => {
        const response = await createApp(createService()).request(
            '/api/tasks/session',
            { method: 'POST' },
        )
        expect(await response.json()).toEqual({ userId: user.id })
    })

    it('passes bounded list filters for the current user', async () => {
        let captured: unknown
        const service = createService({
            listTasks: async (userId, query) => {
                captured = { userId, query }
                return { tasks: [], nextCursor: 'next' }
            },
        })
        const response = await createApp(service).request(
            '/api/tasks?type=product_swap&cursor=abc&limit=500',
        )

        expect(response.status).toBe(200)
        expect(captured).toEqual({
            userId: user.id,
            query: {
                taskType: 'product_swap',
                cursor: 'abc',
                limit: 50,
            },
        })
    })

    it('returns 410 when an owned asset has expired', async () => {
        const service = createService({
            getAsset: async () => 'expired',
        })
        const response = await createApp(service).request(
            '/api/tasks/task_a/assets/asset_a',
        )
        const data = await response.json() as any

        expect(response.status).toBe(410)
        expect(data.error.code).toBe('ASSET_EXPIRED')
    })

    it('streams a private owned asset', async () => {
        const service = createService({
            getAsset: async () => ({
                body: new Blob(['image']).stream(),
                contentType: 'image/png',
                etag: 'etag-a',
            }),
        })
        const response = await createApp(service).request(
            '/api/tasks/task_a/assets/asset_a',
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toBe('image/png')
        expect(response.headers.get('Cache-Control')).toBe(
            'private, max-age=300',
        )
        expect(await response.text()).toBe('image')
    })

    it('does not expose or delete an unowned task', async () => {
        const app = createApp(createService())
        const detail = await app.request('/api/tasks/other')
        const deletion = await app.request('/api/tasks/other', {
            method: 'DELETE',
        })

        expect(detail.status).toBe(404)
        expect(deletion.status).toBe(404)
    })
})
