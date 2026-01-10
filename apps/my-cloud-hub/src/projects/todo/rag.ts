import { Hono } from 'hono'

type Bindings = {
    DB: D1Database
    VECTORIZE: VectorizeIndex
    AI: Ai
}

interface Task {
    id: string
    title: string
    description: string | null
    status: string
    dueDate: string | null
    createdAt: number
    completedAt: number | null
    vectorId: string | null
}

const ragRouter = new Hono<{ Bindings: Bindings }>()

/**
 * 向量化文本
 */
async function vectorizeText(c: any, text: string): Promise<number[]> {
    const embeddings = await c.env.AI.run('@cf/baai/bge-small-en-v1.5', {
        text: [text],
    })
    return embeddings.data[0]
}

/**
 * 将任务向量化并存储
 */
export async function indexTask(c: any, task: Task) {
    const textToEmbed = `${task.title} ${task.description || ''} ${task.dueDate || ''}`
    const vector = await vectorizeText(c, textToEmbed)

    const vectors = [{
        id: task.id,
        values: vector,
        metadata: {
            title: task.title,
            status: task.status,
            dueDate: task.dueDate || '',
        },
    }]

    await c.env.VECTORIZE.upsert(vectors)

    return task.id
}

/**
 * RAG 搜索任务
 */
ragRouter.post('/search', async (c) => {
    try {
        const { query, topK = 5 } = await c.req.json()

        // 向量化查询
        const queryVector = await vectorizeText(c, query)

        // 向量搜索
        const results = await c.env.VECTORIZE.query(queryVector, {
            topK,
            returnValues: true,
            returnMetadata: 'all',
        })

        // 从数据库获取完整任务信息
        const taskIds = results.matches.map((m: any) => m.id)

        if (taskIds.length === 0) {
            return c.json({ tasks: [], scores: [] })
        }

        const placeholders = taskIds.map(() => '?').join(',')
        const query_sql = `SELECT * FROM todo_tasks WHERE id IN (${placeholders})`

        const tasksResult = await c.env.DB.prepare(query_sql)
            .bind(...taskIds)
            .all()

        // 按相似度排序
        const taskMap = new Map(tasksResult.results.map((t: any) => [t.id, t]))
        const orderedTasks = results.matches.map((m: any) => ({
            task: taskMap.get(m.id),
            score: m.score,
        }))

        return c.json({
            tasks: orderedTasks.map(t => t.task),
            scores: orderedTasks.map(t => t.score),
        })
    } catch (error: any) {
        console.error('RAG search error:', error)
        return c.json({ error: error.message }, 500)
    }
})

export default ragRouter
