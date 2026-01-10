import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

type Bindings = {
    DB: D1Database
    VECTORIZE: VectorizeIndex
    AI: Ai
    DOUBAO_API_KEY: string
    DOUBAO_CHAT_ENDPOINT: string
}

const chatRouter = new Hono<{ Bindings: Bindings }>()

interface Message {
    role: 'system' | 'user' | 'assistant'
    content: string
}

/**
 * 对话API - 流式输出
 */
chatRouter.post('/', async (c) => {
    try {
        const { messages, userMessage } = await c.req.json()

        // 检查环境变量
        if (!c.env.DOUBAO_API_KEY || !c.env.DOUBAO_CHAT_ENDPOINT) {
            return c.json({ error: 'API配置缺失' }, 500)
        }

        // 检查是否需要查询历史任务
        const needsTaskSearch = /查看|查询|有什么|任务|什么时候|明天|今天|本周/.test(userMessage)

        let taskContext = ''
        if (needsTaskSearch) {
            try {
                const allTasks = await c.env.DB.prepare('SELECT * FROM todo_tasks WHERE status = ? LIMIT 10')
                    .bind('pending')
                    .all()

                if (allTasks.results && allTasks.results.length > 0) {
                    taskContext = '\n\n当前任务:\n' + allTasks.results.map((t: any) =>
                        `- ${t.title} ${t.due_date ? `(${t.due_date})` : ''}`
                    ).join('\n')
                }
            } catch (dbError) {
                console.error('Task fetch failed:', dbError)
            }
        }

        // 系统提示词
        const systemPrompt = `你是一个TODO助手。你的任务是：
1. 与用户讨论任务细节
2. 当用户说"总结"、"记录"、"添加"时，提取任务信息并返回JSON
3. 当用户询问任务时，基于提供的任务列表回答
4. 判断对话是否转向新主题

输出格式规则：
- 普通对话：直接回复文本
- 创建任务：返回JSON格式 {"action":"create","title":"...","description":"...","dueDate":"YYYY-MM-DD HH:mm"}
- 更新任务：返回JSON格式 {"action":"update","taskId":"...","updates":{...}}
- 新话题检测：在回复开头加上 [NEW_TOPIC]

${taskContext}`

        const fullMessages: Message[] = [
            { role: 'system', content: systemPrompt },
            ...messages,
        ]

        // 调用豆包API - 流式
        const doubaoResponse = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${c.env.DOUBAO_API_KEY}`,
            },
            body: JSON.stringify({
                model: c.env.DOUBAO_CHAT_ENDPOINT,
                messages: fullMessages,
                stream: true,
            }),
        })

        if (!doubaoResponse.ok) {
            const errorText = await doubaoResponse.text()
            console.error('Doubao API error:', doubaoResponse.status, errorText)
            return c.json({ error: `API错误: ${doubaoResponse.status}` }, 500)
        }

        // 返回SSE流
        return streamSSE(c, async (stream) => {
            const reader = doubaoResponse.body?.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            if (!reader) {
                await stream.writeSSE({ data: JSON.stringify({ error: 'No response stream' }) })
                return
            }

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6)
                            if (data === '[DONE]') continue

                            try {
                                const json = JSON.parse(data)
                                if (json.choices?.[0]?.delta?.content) {
                                    await stream.writeSSE({
                                        data: JSON.stringify({ content: json.choices[0].delta.content })
                                    })
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Stream error:', error)
                await stream.writeSSE({ data: JSON.stringify({ error: 'Stream error' }) })
            }
        })

    } catch (error: any) {
        console.error('Chat error:', error)
        return c.json({ error: error.message }, 500)
    }
})

export default chatRouter
