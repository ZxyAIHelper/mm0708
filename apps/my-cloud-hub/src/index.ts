import { Hono, type Context, type Next } from 'hono'
import { cors } from 'hono/cors'
import memeRouter from './projects/meme-generator'
import tasksRouter from './projects/todo/tasks'
import ragRouter from './projects/todo/rag'
import chatRouter from './projects/todo/chat'
import { sendWeChatNotification } from './utils/wechat'
import emailMonitorRouter from './projects/email-monitor/router'
import { handleEmail } from './projects/email-monitor/handler'
import coupletRouter from './projects/couplet/router'
import blockDuelRouter from './projects/block-duel/router'
import pushRouter from './projects/push/router'
import productSwapRouter from './projects/product-swap/router'
import taskHistoryRouter from './projects/task-history/router'
import { CloudflareTaskHistoryService } from './projects/task-history/service'
import { runExpiredAssetCleanup } from './projects/task-history/cleanup'
export { BlockDuelRoom } from './projects/block-duel/room'

type Bindings = {
    DB: D1Database
    TASK_ASSETS: R2Bucket
    WECHAT_KV: KVNamespace
    VECTORIZE: VectorizeIndex
    AI: Ai
    DOUBAO_API_KEY: string
    DOUBAO_IMAGE_ENDPOINT_ID: string
    DOUBAO_PRODUCT_SWAP_ENDPOINT_ID?: string
    DOUBAO_CHAT_ENDPOINT: string
    WECHAT_APPID: string
    WECHAT_SECRET: string
    WECHAT_TEMPLATE_APPID?: string
    WECHAT_TEMPLATE_SECRET?: string
    BLOCK_DUEL_ROOM: DurableObjectNamespace
}

export function isTrustedOrigin(origin: string) {
    if (origin === 'https://product-swap.mm0708.top') {
        return true
    }
    try {
        const url = new URL(origin)
        return (url.hostname === 'localhost'
            || url.hostname === '127.0.0.1')
            && (url.protocol === 'http:' || url.protocol === 'https:')
    } catch {
        return false
    }
}

function isCorsOrigin(origin: string) {
    return /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.mm0708\.top$/i
        .test(origin) || isTrustedOrigin(origin)
}

export function createApp() {
    const app = new Hono<{ Bindings: Bindings }>()

    const protectPrivateOrigin = async (c: Context, next: Next) => {
        const origin = c.req.header('Origin') || ''
        if (origin && !isTrustedOrigin(origin)) {
            return c.json({
                success: false,
                error: { code: 'ORIGIN_NOT_ALLOWED' },
            }, 403)
        }
        await next()
    }
    app.use('/api/tasks/*', protectPrivateOrigin)
    app.use('/api/product-swap/*', protectPrivateOrigin)

    app.use('/*', cors({
        origin: (origin) => isCorsOrigin(origin)
            ? origin
            : null,
        allowMethods: [
            'GET',
            'HEAD',
            'POST',
            'DELETE',
            'OPTIONS',
        ],
        allowHeaders: ['Content-Type', 'X-Browser-Session'],
        exposeHeaders: ['ETag'],
        credentials: true,
        maxAge: 86400,
    }))

    app.get('/', (c) => c.json({
        name: 'My Cloud Hub',
        version: '1.0.0',
        status: 'running',
    }))

    app.route('/api/meme', memeRouter)
    app.route('/api/todo/tasks', tasksRouter)
    app.route('/api/todo/rag', ragRouter)
    app.route('/api/todo/chat', chatRouter)
    app.route('/api/email-monitor', emailMonitorRouter)
    app.route('/api/couplet', coupletRouter)
    app.route('/api/block-duel', blockDuelRouter)
    app.route('/api/push', pushRouter)
    app.route('/api/tasks', taskHistoryRouter)
    app.route('/api/product-swap', productSwapRouter)

    app.onError(async (err, c) => {
        console.error(JSON.stringify({
            event: 'worker_request_error',
            message: err.message,
        }))

        if (c.env.WECHAT_APPID && c.env.WECHAT_SECRET) {
            try {
                await sendWeChatNotification(
                    c.env,
                    `Backend Error: ${err.message}`,
                )
            } catch (notifyError) {
                console.error(JSON.stringify({
                    event: 'worker_error_notification_failed',
                    message: notifyError instanceof Error
                        ? notifyError.message
                        : 'unknown',
                }))
            }
        }

        return c.json({
            error: 'Internal Server Error',
            message: err.message,
        }, 500)
    })

    return app
}

const app = createApp()

export default {
    fetch: app.fetch,
    email: handleEmail,
    scheduled(
        controller: ScheduledController,
        env: Bindings,
        ctx: ExecutionContext,
    ) {
        const service = new CloudflareTaskHistoryService(env)
        ctx.waitUntil(
            runExpiredAssetCleanup(service, controller.scheduledTime)
                .then((deleted) => {
                    console.log(JSON.stringify({
                        event: 'task_asset_cleanup_completed',
                        deleted,
                    }))
                }),
        )
    },
}
