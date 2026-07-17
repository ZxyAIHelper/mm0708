/**
 * WeChat notification utilities.
 */

type Bindings = {
    WECHAT_KV: KVNamespace
    WECHAT_APPID: string
    WECHAT_SECRET: string
    WECHAT_TEMPLATE_APPID?: string
    WECHAT_TEMPLATE_SECRET?: string
}

interface WeChatAccessTokenResponse {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
}

type TemplateMessagePayload = {
    openid: string
    templateId: string
    url?: string
    miniProgram?: {
        appid: string
        pagepath: string
    }
    data: Record<string, { value: string; color?: string }>
}

function getTemplateCredentials(env: Bindings) {
    return {
        appId: env.WECHAT_TEMPLATE_APPID || env.WECHAT_APPID,
        secret: env.WECHAT_TEMPLATE_SECRET || env.WECHAT_SECRET,
    }
}

export async function getWeChatAccessToken(
    env: Bindings,
    credentials?: { appId: string; secret: string }
): Promise<string> {
    const appId = credentials?.appId || env.WECHAT_APPID
    const secret = credentials?.secret || env.WECHAT_SECRET
    const cacheKey = `wechat_access_token:${appId}`

    const cachedToken = await env.WECHAT_KV.get(cacheKey)
    if (cachedToken) {
        return cachedToken
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`
    const response = await fetch(url)
    const data: WeChatAccessTokenResponse = await response.json()

    if (data.access_token) {
        await env.WECHAT_KV.put(cacheKey, data.access_token, {
            expirationTtl: 7000,
        })
        return data.access_token
    }

    throw new Error(`Failed to get WeChat access token: ${data.errmsg}`)
}

export async function sendWeChatTemplateMessage(
    env: Bindings,
    payload: TemplateMessagePayload
) {
    const credentials = getTemplateCredentials(env)

    if (!credentials.appId || !credentials.secret) {
        throw new Error('WeChat template credentials missing')
    }

    const accessToken = await getWeChatAccessToken(env, credentials)
    const response = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                touser: payload.openid,
                template_id: payload.templateId,
                url: payload.url,
                miniprogram: payload.miniProgram,
                data: payload.data,
            }),
        }
    )

    const data = (await response.json()) as {
        errcode?: number
        errmsg?: string
        msgid?: number
    }

    if (!response.ok) {
        throw new Error(`WeChat API Error: ${response.status}`)
    }

    if (data.errcode && data.errcode !== 0) {
        throw new Error(`WeChat API Error: ${data.errmsg || data.errcode}`)
    }

    return data
}

export async function sendWeChatNotification(
    env: Bindings,
    message: string
): Promise<void> {
    try {
        await getWeChatAccessToken(env)
        console.log(`WeChat Notification: ${message}`)
    } catch (error) {
        console.error('Failed to send WeChat notification:', error)
    }
}
