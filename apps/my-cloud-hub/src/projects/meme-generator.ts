import { Hono } from 'hono'

type Bindings = {
    DB: D1Database
    WECHAT_KV: KVNamespace
    DOUBAO_API_KEY: string
    DOUBAO_ENDPOINT_ID: string
}

const memeRouter = new Hono<{ Bindings: Bindings }>()

memeRouter.post('/generate', async (c) => {
    const { DOUBAO_API_KEY, DOUBAO_ENDPOINT_ID } = c.env

    if (!DOUBAO_API_KEY || !DOUBAO_ENDPOINT_ID) {
        return c.json({ error: 'Missing API configuration in environment variables.' }, 500)
    }

    try {
        const { image, prompt, model } = await c.req.json()

        // 豆包 API (Volcengine Ark) 图片生成接口
        const apiEndpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DOUBAO_API_KEY}`,
            },
            body: JSON.stringify({
                model: DOUBAO_ENDPOINT_ID,
                prompt: prompt,
                image: image,
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
                },
                response.status
            )
        }

        return c.json(data)
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

export default memeRouter
