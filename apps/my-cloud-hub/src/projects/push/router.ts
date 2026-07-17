import { Hono } from 'hono'
import { sendWeChatTemplateMessage } from '../../utils/wechat'
import {
    getStoredWeComWebhookUrl,
    type WeComMessageType,
    sendWeComWebhookMessage,
} from '../../utils/wecom'

type Bindings = {
    DB: D1Database
    WECHAT_KV: KVNamespace
    WECHAT_APPID: string
    WECHAT_SECRET: string
    WECHAT_TEMPLATE_APPID?: string
    WECHAT_TEMPLATE_SECRET?: string
}

type PushRequest =
    | {
          type: 'wecom-webhook'
          webhookUrl?: string
          msgtype?: WeComMessageType
          content?: string
      }
    | {
          type: 'wechat-template'
          openid?: string
          templateId?: string
          url?: string
          miniProgram?: {
              appid: string
              pagepath: string
          }
          data?: Record<string, { value: string; color?: string }>
      }

const pushRouter = new Hono<{ Bindings: Bindings }>()

pushRouter.post('/send', async (c) => {
    try {
        const body = await c.req.json<PushRequest>()

        if (body.type === 'wecom-webhook') {
            if (!body.content) {
                return c.json({ error: 'content is required' }, 400)
            }

            const webhookUrl = body.webhookUrl || (await getStoredWeComWebhookUrl(c.env.DB))
            if (!webhookUrl) {
                return c.json({ error: 'WeCom webhook URL not configured' }, 400)
            }

            await sendWeComWebhookMessage({
                webhookUrl,
                msgtype: body.msgtype,
                content: body.content,
            })

            return c.json({
                success: true,
                channel: 'wecom-webhook',
            })
        }

        if (body.type === 'wechat-template') {
            if (!body.openid || !body.templateId || !body.data) {
                return c.json(
                    { error: 'openid, templateId, and data are required' },
                    400
                )
            }

            await sendWeChatTemplateMessage(c.env, {
                openid: body.openid,
                templateId: body.templateId,
                url: body.url,
                miniProgram: body.miniProgram,
                data: body.data,
            })

            return c.json({
                success: true,
                channel: 'wechat-template',
            })
        }

        return c.json({ error: 'Unsupported push type' }, 400)
    } catch (error: any) {
        return c.json({ error: error.message || 'Push failed' }, 500)
    }
})

export default pushRouter
