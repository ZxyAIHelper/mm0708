import { Hono } from 'hono'
import { sendWeChatNotification } from '../../utils/wechat'

type Bindings = {
    DB: D1Database
    WECHAT_KV: KVNamespace
    WECHAT_APPID: string
    WECHAT_SECRET: string
}

const emailMonitorRouter = new Hono<{ Bindings: Bindings }>()

// List rules
emailMonitorRouter.get('/rules', async (c) => {
    try {
        const rules = await c.env.DB.prepare('SELECT * FROM email_rules ORDER BY created_at DESC').all()
        return c.json({ rules: rules.results })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

// Create rule
emailMonitorRouter.post('/rules', async (c) => {
    try {
        const { name, matchType, matchValue, forwardToWecom } = await c.req.json()

        if (!name || !matchType) {
            return c.json({ error: 'Name and Match Type are required' }, 400)
        }

        const result = await c.env.DB.prepare(`
            INSERT INTO email_rules (name, match_type, match_value, forward_to_wecom, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(name, matchType, matchValue, forwardToWecom ? 1 : 0, 1, Date.now()).run()

        return c.json({ success: true, id: result.meta.last_row_id })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

// Delete rule
emailMonitorRouter.delete('/rules/:id', async (c) => {
    try {
        const id = c.req.param('id')
        await c.env.DB.prepare('DELETE FROM email_rules WHERE id = ?').bind(id).run()
        return c.json({ success: true })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

// Get Config (masked)
emailMonitorRouter.get('/config', async (c) => {
    try {
        const result = await c.env.DB.prepare("SELECT value FROM wecom_config WHERE key = 'wecom_webhook_url'").first()
        const webhookUrl = result ? result.value as string : ''

        return c.json({
            webhookUrl: webhookUrl ? `${webhookUrl.substring(0, 20)}...` : ''
        })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

// Update Config
emailMonitorRouter.post('/config', async (c) => {
    try {
        const { webhookUrl } = await c.req.json()

        await c.env.DB.prepare(`
            INSERT INTO wecom_config (key, value, updated_at)
            VALUES ('wecom_webhook_url', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).bind(webhookUrl, Date.now()).run()

        return c.json({ success: true })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

// Test Notification
emailMonitorRouter.post('/test', async (c) => {
    try {
        const result = await c.env.DB.prepare("SELECT value FROM wecom_config WHERE key = 'wecom_webhook_url'").first()
        const webhookUrl = result ? result.value as string : ''

        if (!webhookUrl) {
            return c.json({ error: 'Webhook URL not configured' }, 400)
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                msgtype: 'markdown',
                markdown: {
                    content: `**Email Monitor Test**\n\nThis is a test notification from your Email Monitor Service.`
                }
            })
        })

        if (!response.ok) {
            throw new Error(`WeCom API Error: ${response.statusText}`)
        }

        return c.json({ success: true })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

export default emailMonitorRouter
