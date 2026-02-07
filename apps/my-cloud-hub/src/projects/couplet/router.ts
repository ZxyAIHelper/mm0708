import { Hono } from 'hono'
import promptRouter from './prompts'

type Bindings = {
    DB: D1Database
    DOUBAO_API_KEY: string
    DOUBAO_CHAT_ENDPOINT: string
    WECHAT_APPID: string
    WECHAT_SECRET: string
}

const coupletRouter = new Hono<{ Bindings: Bindings }>()

interface CoupletRequest {
    type: 'new_year' | 'housewarming' // 场景：新年/乔迁
    mode: 'couple' | 'child' // 模式：情侣/孩子
    names: string[] // 名字列表：情侣为[name1, name2]，孩子为[name1]
    user_openid?: string // 用户 openid（可选，用于记录）
}

interface AuthRequest {
    code: string // 微信登录 code
    userInfo?: {
        nickName: string
        avatarUrl?: string
    }
}

interface CoupletResponse {
    top: string // 横批
    left: string // 上联
    right: string // 下联
    explanation: string // 寓意解析
}

// WeChat 认证登录接口
coupletRouter.post('/auth', async (c) => {
    try {
        const { code, userInfo } = await c.req.json<AuthRequest>()

        if (!code) {
            return c.json({ error: 'Code is required' }, 400)
        }

        const { WECHAT_APPID, WECHAT_SECRET } = c.env

        if (!WECHAT_APPID || !WECHAT_SECRET) {
            return c.json({ error: 'WeChat configuration missing' }, 500)
        }

        // 1. 调用微信接口换取 openid 和 session_key
        const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`
        const wxResponse = await fetch(wxUrl)
        const wxData = await wxResponse.json() as any

        if (wxData.errcode) {
            console.error('WeChat API Error:', wxData)
            return c.json({ error: 'WeChat auth failed', details: wxData.errmsg }, 400)
        }

        const { openid, session_key } = wxData

        // 2. 查找或创建用户
        const db = c.env.DB
        let user = await db.prepare('SELECT * FROM users WHERE wechat_openid = ?').bind(openid).first()

        if (!user) {
            // 创建新用户
            const username = userInfo?.nickName || `用户${openid.slice(-6)}`
            const result = await db.prepare(
                'INSERT INTO users (username, wechat_openid, created_at) VALUES (?, ?, ?)'
            ).bind(username, openid, Date.now()).run()

            user = {
                id: result.meta.last_row_id,
                username,
                wechat_openid: openid,
                created_at: Date.now()
            }
        }

        return c.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                openid: user.wechat_openid
            },
            session_key // 小程序可能需要用于解密用户信息
        })

    } catch (error: any) {
        console.error('Auth Error:', error)
        return c.json({ error: error.message }, 500)
    }
})

coupletRouter.post('/generate', async (c) => {
    try {
        const { type, mode, names, user_openid } = await c.req.json<CoupletRequest>()

        // 1. Input Validation
        if (!type || !mode || !names || !Array.isArray(names)) {
            return c.json({ error: 'Invalid input parameters' }, 400)
        }

        if (mode === 'couple' && names.length !== 2) {
            return c.json({ error: 'Couple mode requires exactly 2 names' }, 400)
        }
        if (mode === 'child' && names.length !== 1) {
            return c.json({ error: 'Child mode requires exactly 1 names' }, 400)
        }

        const { DOUBAO_API_KEY, DOUBAO_CHAT_ENDPOINT } = c.env

        if (!DOUBAO_API_KEY || !DOUBAO_CHAT_ENDPOINT) {
            return c.json({ error: 'Server configuration error' }, 500)
        }

        // 2. Construct Prompt
        let systemPrompt = `你是一个精通中国传统文化的国学大师，擅长创作对联。
你的任务是根据用户提供的名字和场景，创作一副藏头或藏字的对联。
请严格按照 JSON 格式输出，不要包含 markdown 标记。
JSON 格式要求：
{
  "top": "四字横批",
  "left": "上联（7-9字）",
  "right": "下联（7-9字）",
  "explanation": "对联寓意解析（100字以内）"
}`

        let userPrompt = ''
        const scenario = type === 'new_year' ? '新年春节' : '乔迁新居'

        if (mode === 'couple') {
            userPrompt = `请为一对情侣/夫妻创作一副${scenario}对联。
名字1：${names[0]}
名字2：${names[1]}
要求：
1. 必须将两人的名字中的字自然地融入上联和下联中（可以是藏头，也可以是藏在句中）。
2. 横批要喜庆吉利。
3. 寓意要祝福二人感情甜蜜，且符合${scenario}的氛围。
4. 对仗要在工整的基础上，文采飞扬。`
        } else {
            userPrompt = `请为一个孩子创作一副${scenario}对联。
孩子名字：${names[0]}
要求：
1. 必须将孩子名字中的字（最好是2个字）分别融入上联和下联中。
2. 横批要充满希望。
3. 寓意要祝福孩子健康成长/学业进步，且符合${scenario}的氛围。
4. 对仗工整。`
        }

        // 3. Call AI
        const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DOUBAO_API_KEY}`,
            },
            body: JSON.stringify({
                model: DOUBAO_CHAT_ENDPOINT,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7, // 稍微有点创意
            }),
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('Doubao API Error:', errText)
            return c.json({ error: 'AI generation failed' }, 500)
        }

        const data = await response.json() as any
        const content = data.choices?.[0]?.message?.content

        if (!content) {
            return c.json({ error: 'Empty response from AI' }, 500)
        }

        // 4. Parse JSON
        // 这里的 content 可能会包含 markdown ```json ... ```，尝试清理一下
        let cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim()

        try {
            const result = JSON.parse(cleanContent)

            // 4. 保存生成记录（如果提供了 user_openid）
            if (user_openid) {
                try {
                    const db = c.env.DB
                    // 查找或创建用户
                    let user = await db.prepare('SELECT id FROM users WHERE wechat_openid = ?').bind(user_openid).first()

                    if (!user) {
                        // 如果用户不存在，创建一个临时用户记录
                        const insertResult = await db.prepare(
                            'INSERT INTO users (username, wechat_openid, created_at) VALUES (?, ?, ?)'
                        ).bind(`用户${user_openid.slice(-6)}`, user_openid, Date.now()).run()
                        user = { id: insertResult.meta.last_row_id }
                    }

                    // 保存生成记录
                    await db.prepare(
                        'INSERT INTO couplet_generations (user_id, openid, type, mode, names, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                    ).bind(
                        user.id,
                        user_openid,
                        type,
                        mode,
                        JSON.stringify(names),
                        JSON.stringify(result),
                        Date.now()
                    ).run()
                } catch (dbError) {
                    console.error('Failed to save generation record:', dbError)
                    // 不影响主流程，继续返回结果
                }
            }

            return c.json(result)
        } catch (e) {
            console.error('JSON Parse Error:', cleanContent)
            // Fallback attempt or return error
            return c.json({ error: 'Failed to parse AI response', raw: cleanContent }, 500)
        }

    } catch (error: any) {
        console.error('Couplet Generate Error:', error)
        return c.json({ error: error.message }, 500)
    }
})

// 查询生成记录（管理后台使用）
coupletRouter.get('/records', async (c) => {
    try {
        const db = c.env.DB
        const page = parseInt(c.req.query('page') || '1')
        const limit = parseInt(c.req.query('limit') || '20')
        const offset = (page - 1) * limit

        // 查询记录并关联用户信息
        const records = await db.prepare(`
            SELECT 
                cg.id,
                cg.type,
                cg.mode,
                cg.names,
                cg.result,
                cg.created_at,
                u.username,
                u.wechat_openid as openid
            FROM couplet_generations cg
            LEFT JOIN users u ON cg.user_id = u.id
            ORDER BY cg.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all()

        // 查询总数
        const countResult = await db.prepare('SELECT COUNT(*) as total FROM couplet_generations').first()
        const total = Number(countResult?.total) || 0

        return c.json({
            success: true,
            data: records.results.map((r: any) => ({
                ...r,
                names: JSON.parse(r.names),
                result: JSON.parse(r.result)
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        })

    } catch (error: any) {
        console.error('Records Query Error:', error)
        return c.json({ error: error.message }, 500)
    }
})

// Mount prompt management routes
coupletRouter.route('/', promptRouter)

export default coupletRouter

