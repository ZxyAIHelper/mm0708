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

        // 检查用户意图
        const wantsToComplete = /完成|做完|finish|done/.test(userMessage)
        const wantsToQuery = /查看|查询|有什么|任务|什么时候|明天|今天|本周/.test(userMessage)
        const needsTaskList = wantsToComplete || wantsToQuery

        let taskContext = ''
        if (needsTaskList) {
            try {
                // 获取所有待办任务（完成操作需要完整信息）
                const allTasks = await c.env.DB.prepare(
                    wantsToComplete
                        ? 'SELECT * FROM todo_tasks WHERE status = ? ORDER BY created_at DESC LIMIT 20'
                        : 'SELECT * FROM todo_tasks WHERE status = ? LIMIT 10'
                ).bind('pending').all()

                if (allTasks.results && allTasks.results.length > 0) {
                    taskContext = '\n\n当前待办任务列表：\n' + allTasks.results.map((t: any, idx: number) =>
                        `${idx + 1}. [ID: ${t.id}] ${t.title}${t.due_date ? ` (截止: ${t.due_date})` : ''}${t.description ? ` - ${t.description}` : ''}`
                    ).join('\n')
                } else {
                    taskContext = '\n\n当前没有待办任务。'
                }
            } catch (dbError) {
                console.error('Task fetch failed:', dbError)
            }
        }

        // 系统提示词
        const systemPrompt = `你是一个TODO助手。你的任务是：

1. **理解用户意图**：
   - "记录XXX" / "总结" / "添加XXX" → 创建新任务
   - "完成XXX" / "做完XXX" → 标记任务完成
   - "有什么任务" / "查看任务" → 列出任务

2. **多步骤推理**：
   - 如果用户说"完成XXX"，先检查任务列表中是否有匹配的任务
   - 使用模糊匹配（部分文字相同即可）
   - 找到匹配任务后，返回update操作

3. **输出格式**：
   - 创建任务：{"action":"create","title":"任务名","description":"描述","dueDate":"YYYY-MM-DD HH:mm"}
   - 完成任务：{"action":"update","taskId":"任务ID","title":"任务名","updates":{"status":"completed"}}
   - 普通对话：直接回复文本
   - 新话题：在回复开头加 [NEW_TOPIC]

${taskContext}

**重要**：如果用户说"完成某任务"，你必须：
1. 在上面的任务列表中查找匹配的任务（模糊匹配）
2. 如果找到，返回update的JSON
3. 如果没找到，询问用户是否要创建新任务`

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
