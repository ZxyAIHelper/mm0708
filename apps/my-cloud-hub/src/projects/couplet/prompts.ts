// Prompt management endpoints
import { Hono } from 'hono'

type Bindings = {
    DB: D1Database
}

const promptRouter = new Hono<{ Bindings: Bindings }>()

// GET current prompts
promptRouter.get('/prompts', async (c) => {
    // Return hardcoded prompts for now (will be DB-backed later)
    return c.json({
        system: `你是一个精通中国传统文化的国学大师，擅长创作对联。
你的任务是根据用户提供的名字和场景，创作一副藏头或藏字的对联。
请严格按照 JSON 格式输出，不要包含 markdown 标记。
JSON 格式要求：
{
  "top": "四字横批",
  "left": "上联（7-9字）",
  "right": "下联（7-9字）",
  "explanation": "对联寓意解析（100字以内）"
}`,
        couple_template: `请为一对情侣/夫妻创作一副{scenario}对联。
名字1：{name1}
名字2：{name2}
要求：
1. 必须将两人的名字中的字自然地融入上联和下联中（可以是藏头，也可以是藏在句中）。
2. 横批要喜庆吉利。
3. 寓意要祝福二人感情甜蜜，且符合{scenario}的氛围。
4. 对仗要在工整的基础上，文采飞扬。`,
        child_template: `请为一个孩子创作一副{scenario}对联。
孩子名字：{name}
要求：
1. 必须将孩子名字中的字（最好是2个字）分别融入上联和下联中。
2. 横批要充满希望。
3. 寓意要祝福孩子健康成长/学业进步，且符合{scenario}的氛围。
4. 对仗工整。`
    })
})

// POST save prompt
promptRouter.post('/prompts', async (c) => {
    const { type, content } = await c.req.json()

    // TODO: Save to database with versioning
    // For now, just return success
    return c.json({ success: true, message: 'Prompt saved successfully' })
})

// GET prompt history
promptRouter.get('/prompts/history', async (c) => {
    // TODO: Fetch from database
    return c.json([])
})

export default promptRouter
