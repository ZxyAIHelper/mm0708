type WebhookResponse = {
    errcode?: number
    errmsg?: string
}

export type WeComMessageType = 'text' | 'markdown'

export async function getStoredWeComWebhookUrl(db: D1Database): Promise<string> {
    const result = await db
        .prepare("SELECT value FROM wecom_config WHERE key = 'wecom_webhook_url'")
        .first()

    return result ? String(result.value ?? '') : ''
}

export async function sendWeComWebhookMessage(options: {
    webhookUrl: string
    content: string
    msgtype?: WeComMessageType
}) {
    const msgtype = options.msgtype ?? 'markdown'

    const body =
        msgtype === 'text'
            ? {
                  msgtype: 'text',
                  text: {
                      content: options.content,
                  },
              }
            : {
                  msgtype: 'markdown',
                  markdown: {
                      content: options.content,
                  },
              }

    const response = await fetch(options.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    const data = (await response.json()) as WebhookResponse

    if (!response.ok) {
        throw new Error(`WeCom API Error: ${response.status}`)
    }

    if (data.errcode && data.errcode !== 0) {
        throw new Error(`WeCom API Error: ${data.errmsg || data.errcode}`)
    }

    return data
}
