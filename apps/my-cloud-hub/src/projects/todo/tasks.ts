import { Hono } from 'hono'
import { indexTask } from './rag'

type Bindings = {
    DB: D1Database
    VECTORIZE: VectorizeIndex
    AI: Ai
}

const tasksRouter = new Hono<{ Bindings: Bindings }>()

/**
 * 生成UUID
 */
function generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 获取所有任务
 */
tasksRouter.get('/', async (c) => {
    try {
        const result = await c.env.DB.prepare(`
      SELECT * FROM todo_tasks 
      ORDER BY 
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        created_at DESC
    `).all()

        return c.json({ tasks: result.results })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

/**
 * 创建任务
 */
tasksRouter.post('/', async (c) => {
    try {
        const { title, description, dueDate } = await c.req.json()

        if (!title) {
            return c.json({ error: 'Title is required' }, 400)
        }

        const id = generateId()
        const now = Date.now()

        await c.env.DB.prepare(`
      INSERT INTO todo_tasks (id, title, description, status, due_date, created_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).bind(id, title, description || null, dueDate || null, now).run()

        const task = {
            id,
            title,
            description,
            status: 'pending',
            dueDate,
            createdAt: now,
            completedAt: null,
            vectorId: null,
        }

        // 向量化并索引任务
        try {
            const vectorId = await indexTask(c, task)
            await c.env.DB.prepare(`
        UPDATE todo_tasks SET vector_id = ? WHERE id = ?
      `).bind(vectorId, id).run()
            task.vectorId = vectorId
        } catch (vectorError) {
            console.error('Failed to index task:', vectorError)
        }

        return c.json({ task })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

/**
 * 更新任务
 */
tasksRouter.put('/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const { title, description, dueDate, status } = await c.req.json()

        const updates: string[] = []
        const values: any[] = []

        if (title !== undefined) {
            updates.push('title = ?')
            values.push(title)
        }
        if (description !== undefined) {
            updates.push('description = ?')
            values.push(description)
        }
        if (dueDate !== undefined) {
            updates.push('due_date = ?')
            values.push(dueDate)
        }
        if (status !== undefined) {
            updates.push('status = ?')
            values.push(status)
            if (status === 'completed') {
                updates.push('completed_at = ?')
                values.push(Date.now())
            }
        }

        if (updates.length === 0) {
            return c.json({ error: 'No fields to update' }, 400)
        }

        values.push(id)

        await c.env.DB.prepare(`
      UPDATE todo_tasks SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run()

        // 重新索引任务
        const result = await c.env.DB.prepare('SELECT * FROM todo_tasks WHERE id = ?').bind(id).first()
        if (result) {
            try {
                await indexTask(c, result as any)
            } catch (vectorError) {
                console.error('Failed to reindex task:', vectorError)
            }
        }

        return c.json({ task: result })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

/**
 * 删除任务
 */
tasksRouter.delete('/:id', async (c) => {
    try {
        const id = c.req.param('id')

        await c.env.DB.prepare('DELETE FROM todo_tasks WHERE id = ?').bind(id).run()

        // 从向量数据库删除
        try {
            await c.env.VECTORIZE.deleteByIds([id])
        } catch (vectorError) {
            console.error('Failed to delete vector:', vectorError)
        }

        return c.json({ success: true })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

export default tasksRouter
