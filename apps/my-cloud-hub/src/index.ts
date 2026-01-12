import { Hono } from 'hono'
import { cors } from 'hono/cors'
import memeRouter from './projects/meme-generator'
import tasksRouter from './projects/todo/tasks'
import ragRouter from './projects/todo/rag'
import chatRouter from './projects/todo/chat'
import { sendWeChatNotification } from './utils/wechat'

type Bindings = {
    DB: D1Database
    WECHAT_KV: KVNamespace
    VECTORIZE: VectorizeIndex
    AI: Ai
    DOUBAO_API_KEY: string
    DOUBAO_IMAGE_ENDPOINT_ID: string
    DOUBAO_CHAT_ENDPOINT: string
    WECHAT_APPID: string
    WECHAT_SECRET: string
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

export default app
