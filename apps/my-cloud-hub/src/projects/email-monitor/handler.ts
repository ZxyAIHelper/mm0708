import { ForwardableEmailMessage, ExecutionContext, KVNamespace } from '@cloudflare/workers-types'
import PostalMime from 'postal-mime'

type Bindings = {
    DB: D1Database
    WECHAT_KV: KVNamespace
}

interface EmailRule {
    id: number
    name: string
    match_type: 'sender' | 'subject' | 'all'
    match_value: string
    forward_to_wecom: number // boolean 0/1
    is_active: number // boolean 0/1
}

/**
 * Upload file to WeCom Webhook Media
 * https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=KEY&type=file
 */
async function uploadMediaToWeCom(webhookKey: string, filename: string, content: ArrayBuffer, contentType: string): Promise<string | null> {
    try {
        const formData = new FormData()
        const blob = new Blob([content], { type: contentType })
        formData.append('media', blob, filename)

        const uploadUrl = `https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${webhookKey}&type=file`

        console.log(`[WeComUpload] Uploading ${filename} (${content.byteLength} bytes)...`)
        const res = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        })

        const data = await res.json() as any
        if (data.errcode === 0 && data.media_id) {
            console.log(`[WeComUpload] Success: ${data.media_id}`)
            return data.media_id
        } else {
            console.error(`[WeComUpload] Failed: ${JSON.stringify(data)}`)
            return null
        }
    } catch (e) {
        console.error(`[WeComUpload] Error:`, e)
        return null
    }
}

export async function handleEmail(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext): Promise<void> {
    console.log(`[EmailWorker] Received email from: ${message.from}`)
    try {
        // 1. Get Rules
        const rulesResult = await env.DB.prepare('SELECT * FROM email_rules WHERE is_active = 1').all<EmailRule>()
        const rules = rulesResult.results

        if (rules.length === 0) {
            console.log('No active rules found.')
            return
        }

        const subject = message.headers.get('subject') || '(No Subject)'
        const from = message.from

        // Match Rules Logic
        let matched = false
        const matchedRules: string[] = []

        for (const rule of rules) {
            let isMatch = false
            const value = rule.match_value || ''

            if (rule.match_type === 'all') {
                isMatch = true
            } else if (rule.match_type === 'sender') {
                if (value.startsWith('/') && value.endsWith('/')) {
                    try {
                        const regex = new RegExp(value.slice(1, -1))
                        isMatch = regex.test(from)
                    } catch (e) {
                        console.error(`Invalid regex: ${value}`)
                    }
                } else {
                    isMatch = from.includes(value)
                }
            } else if (rule.match_type === 'subject') {
                if (value.startsWith('/') && value.endsWith('/')) {
                    try {
                        const regex = new RegExp(value.slice(1, -1))
                        isMatch = regex.test(subject)
                    } catch (e) {
                        console.error(`Invalid regex: ${value}`)
                    }
                } else {
                    isMatch = subject.includes(value)
                }
            }

            if (isMatch) {
                matched = true
                matchedRules.push(rule.name)
            }
        }

        if (!matched) {
            console.log(`Email from ${from} did not match any rules.`)
            return
        }

        // 2. Parse Email Content
        const parser = new PostalMime()
        const rawEmail = await new Response(message.raw).arrayBuffer()
        const email = await parser.parse(rawEmail)

        // 3. Prepare WeCom Notification
        const configResult = await env.DB.prepare("SELECT value FROM wecom_config WHERE key = 'wecom_webhook_url'").first()
        const webhookUrl = configResult ? configResult.value as string : ''

        if (!webhookUrl) {
            console.log('WeCom Webhook URL not configured.')
            return
        }

        // Extract Key from Webhook URL for upload
        // URL format: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx-xxxx
        const keyMatch = webhookUrl.match(/key=([^&]+)/)
        const webhookKey = keyMatch ? keyMatch[1] : null

        // 4. Send Main Text Message
        let bodyText = email.text || email.html || '(No Content)'
        // Truncate body if too long (WeCom limit is 4096 bytes usually, be safe)
        if (bodyText.length > 2000) {
            bodyText = bodyText.substring(0, 2000) + '...\n(Content Truncated)'
        }

        const mainMsg = {
            msgtype: 'markdown',
            markdown: {
                content: `**📧 New Email Matched Rules**
> **From:** ${from}
> **Subject:** ${subject}
> **Matched Rules:** ${matchedRules.join(', ')}
> **Time:** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**Content Preview:**
${bodyText}`
            }
        }

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mainMsg)
        })

        // 5. Handle Attachments
        if (email.attachments && email.attachments.length > 0 && webhookKey) {
            for (const att of email.attachments) {
                // WeCom file limit check (20MB)
                if (att.content.byteLength > 20 * 1024 * 1024) {
                    await fetch(webhookUrl, {
                        method: 'POST',
                        body: JSON.stringify({
                            msgtype: 'markdown',
                            markdown: { content: `⚠️ Aattachment **${att.filename}** too large (>20MB), skipped.` }
                        })
                    })
                    continue
                }

                // Upload
                const mediaId = await uploadMediaToWeCom(webhookKey, att.filename || 'unknown_file', att.content, att.mimeType)

                if (mediaId) {
                    // Send File Message
                    await fetch(webhookUrl, {
                        method: 'POST',
                        body: JSON.stringify({
                            msgtype: 'file',
                            file: { media_id: mediaId }
                        })
                    })
                }
            }
        }

        console.log(`Notification sent for email from ${from}`)

    } catch (error) {
        console.error('Error handling email:', error)
    }
}
