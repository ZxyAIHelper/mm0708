import { Hono } from 'hono'
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
export { BlockDuelRoom } from './projects/block-duel/room'


type Bindings = {
    DB: D1Database
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

const app = new Hono<{ Bindings: Bindings }>()

// 全局 CORS
app.use('/*', cors())

// 根路由
app.get('/', (c) => {
    return c.json({
        name: 'My Cloud Hub',
        version: '1.0.0',
        status: 'running',
    })
})

// 挂载子路由
app.route('/api/meme', memeRouter)
app.route('/api/todo/tasks', tasksRouter)
app.route('/api/todo/rag', ragRouter)
app.route('/api/todo/chat', chatRouter)
app.route('/api/email-monitor', emailMonitorRouter)
app.route('/api/couplet', coupletRouter)
app.route('/api/block-duel', blockDuelRouter)
app.route('/api/push', pushRouter)
app.route('/api/product-swap', productSwapRouter)



// 全局错误处理
app.onError(async (err, c) => {
    console.error(`[Error] ${err.message}`, err)

    // 尝试发送微信通知 (如果配置了)
    if (c.env.WECHAT_APPID && c.env.WECHAT_SECRET) {
        try {
            await sendWeChatNotification(
                c.env,
                `Backend Error: ${err.message}`
            )
        } catch (notifyError) {
            console.error('Failed to send WeChat notification', notifyError)
        }
    }

    return c.json(
        {
            error: 'Internal Server Error',
            message: err.message,
        },
        500
    )
})


export default {
    fetch: app.fetch,
    email: handleEmail
}

