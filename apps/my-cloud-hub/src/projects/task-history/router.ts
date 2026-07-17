import { Hono, type Context } from 'hono'
import { ensureAnonymousSession } from './session'
import { CloudflareTaskHistoryService } from './service'
import type {
    AnonymousUser,
    TaskHistoryEnv,
    TaskHistoryService,
} from './types'

type TaskContext = Context<{ Bindings: TaskHistoryEnv }>

type RouterOptions = {
    resolveUser?: (c: TaskContext) => Promise<AnonymousUser>
    resolveService?: (c: TaskContext) => TaskHistoryService
}

function notFound(c: TaskContext) {
    return c.json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
    }, 404)
}

export function createTaskHistoryRouter(options: RouterOptions = {}) {
    const router = new Hono<{ Bindings: TaskHistoryEnv }>()
    const resolveUser = options.resolveUser
        ?? ((c: TaskContext) => ensureAnonymousSession(c))
    const resolveService = options.resolveService
        ?? ((c: TaskContext) => new CloudflareTaskHistoryService(c.env))

    router.post('/session', async (c) => {
        const user = await resolveUser(c)
        return c.json({ userId: user.id })
    })

    router.get('/', async (c) => {
        const user = await resolveUser(c)
        const requestedType = c.req.query('type') ?? ''
        const taskType = /^[a-z][a-z0-9_]{0,49}$/.test(requestedType)
            ? requestedType
            : undefined
        const requestedLimit = Number(c.req.query('limit') || 30)
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(50, Math.floor(requestedLimit)))
            : 30
        const cursor = (c.req.query('cursor') || '').slice(0, 300)
            || undefined
        const page = await resolveService(c).listTasks(user.id, {
            taskType,
            cursor,
            limit,
        })
        return c.json({ success: true, ...page })
    })

    router.get('/:taskId/assets/:assetId', async (c) => {
        const user = await resolveUser(c)
        const asset = await resolveService(c).getAsset(
            user.id,
            c.req.param('taskId'),
            c.req.param('assetId'),
        )
        if (asset === 'expired') {
            return c.json({
                success: false,
                error: {
                    code: 'ASSET_EXPIRED',
                    message: '图片已过期',
                },
            }, 410)
        }
        if (!asset) {
            return notFound(c)
        }
        const headers = new Headers({
            'Content-Type': asset.contentType,
            'Cache-Control': 'private, max-age=300',
        })
        if (asset.etag) {
            headers.set('ETag', asset.etag)
        }
        return new Response(asset.body, { headers })
    })

    router.get('/:taskId', async (c) => {
        const user = await resolveUser(c)
        const task = await resolveService(c).getTask(
            user.id,
            c.req.param('taskId'),
        )
        return task
            ? c.json({ success: true, task })
            : notFound(c)
    })

    router.delete('/:taskId', async (c) => {
        const user = await resolveUser(c)
        const deleted = await resolveService(c).deleteTask(
            user.id,
            c.req.param('taskId'),
        )
        return deleted
            ? c.json({ success: true })
            : notFound(c)
    })

    return router
}

export default createTaskHistoryRouter()
