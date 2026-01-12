import { Hono } from 'hono'

type Bindings = {
    DB: D1Database
    WECHAT_KV: KVNamespace
    DOUBAO_API_KEY: string
    DOUBAO_IMAGE_ENDPOINT_ID: string
}

const memeRouter = new Hono<{ Bindings: Bindings }>()

memeRouter.post('/generate', async (c) => {
    const { DOUBAO_API_KEY, DOUBAO_IMAGE_ENDPOINT_ID } = c.env

    if (!DOUBAO_API_KEY || !DOUBAO_IMAGE_ENDPOINT_ID) {
        return c.json({ error: 'Missing API configuration in environment variables.' }, 500)
    }

    try {
        const { image, prompt, mode, scene } = await c.req.json()

        // 验证输入
        if (!prompt) {
            return c.json({ error: 'Prompt is required' }, 400)
        }

        // 图片模式需要image参数
        if (mode === 'image' && !image) {
            return c.json({ error: 'Image is required for image mode' }, 400)
        }

        // 豆包 API (Volcengine Ark) 图片生成接口
        const apiEndpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DOUBAO_API_KEY}`,
            },
            body: JSON.stringify({
                model: DOUBAO_IMAGE_ENDPOINT_ID,
                prompt: prompt,
                ...(mode === 'image' && image ? { image } : {}),
                sequential_image_generation: 'disabled',
                response_format: 'url',
                size: '2K',
                stream: false,
                watermark: true
            }),
        })

        const data = await response.json()

        if (!response.ok) {
            console.error('Doubao API Error:', data)
            return c.json(
                {
                    error: 'Doubao API Error',
                    details: data,
                    status: response.status,
                    requestMode: mode,
                    requestScene: scene,
                },
                500
            )
        }

        return c.json(data)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

export default memeRouter
