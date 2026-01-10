/**
 * WeChat Test Account Notification Utility
 * 用于向微信测试号发送通知
 */

type Bindings = {
    WECHAT_KV: KVNamespace
    WECHAT_APPID: string
    WECHAT_SECRET: string
}

interface WeChatAccessTokenResponse {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
}

/**
 * 获取微信 Access Token (带缓存)
 */
export async function getWeChatAccessToken(env: Bindings): Promise<string> {
    const { WECHAT_KV, WECHAT_APPID, WECHAT_SECRET } = env

    // 尝试从 KV 读取缓存
    const cachedToken = await WECHAT_KV.get('wechat_access_token')
    if (cachedToken) {
        return cachedToken
    }

    // 获取新 Token
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}`
    const response = await fetch(url)
    const data: WeChatAccessTokenResponse = await response.json()

    if (data.access_token) {
        // 缓存到 KV (7000 秒，留 200 秒缓冲)
        await WECHAT_KV.put('wechat_access_token', data.access_token, {
            expirationTtl: 7000,
        })
        return data.access_token
    }

    throw new Error(`Failed to get WeChat access token: ${data.errmsg}`)
}

/**
 * 发送微信通知
 */
export async function sendWeChatNotification(
    env: Bindings,
    message: string
): Promise<void> {
    try {
        const accessToken = await getWeChatAccessToken(env)
        // TODO: 实现具体的发送逻辑
        console.log(`WeChat Notification: ${message}`)
    } catch (error) {
        console.error('Failed to send WeChat notification:', error)
    }
}
