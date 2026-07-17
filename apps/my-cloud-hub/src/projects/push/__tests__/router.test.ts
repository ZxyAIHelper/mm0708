import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../../../index'

function createEnv(options?: {
    storedWebhookUrl?: string
    templateAppId?: string
    templateSecret?: string
}) {
    return {
        DB: {
            prepare: vi.fn(() => ({
                first: vi.fn(async () =>
                    options?.storedWebhookUrl ? { value: options.storedWebhookUrl } : null
                ),
                bind: vi.fn(() => ({
                    first: vi.fn(async () =>
                        options?.storedWebhookUrl ? { value: options.storedWebhookUrl } : null
                    ),
                })),
            })),
        },
        WECHAT_KV: {
            get: vi.fn(async () => null),
            put: vi.fn(async () => undefined),
        },
        VECTORIZE: {},
        AI: {},
        DOUBAO_API_KEY: '',
        DOUBAO_IMAGE_ENDPOINT_ID: '',
        DOUBAO_CHAT_ENDPOINT: '',
        WECHAT_APPID: '',
        WECHAT_SECRET: '',
        WECHAT_TEMPLATE_APPID: options?.templateAppId ?? '',
        WECHAT_TEMPLATE_SECRET: options?.templateSecret ?? '',
        BLOCK_DUEL_ROOM: {},
    }
}

describe('Push API', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('sends a WeCom webhook message with an explicit webhook URL', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ errcode: 0, errmsg: 'ok' }),
        }))
        vi.stubGlobal('fetch', fetchMock)

        const req = new Request('http://localhost/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'wecom-webhook',
                webhookUrl: 'https://example.com/wecom',
                msgtype: 'markdown',
                content: '## Daily report',
            }),
        })

        const res = await worker.fetch(req, createEnv(), {} as ExecutionContext)
        expect(res.status).toBe(200)

        const data = await res.json()
        expect(data).toEqual({
            success: true,
            channel: 'wecom-webhook',
        })
        expect(fetchMock).toHaveBeenCalledWith(
            'https://example.com/wecom',
            expect.objectContaining({
                method: 'POST',
            })
        )
    })

    it('falls back to stored WeCom webhook config', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ errcode: 0, errmsg: 'ok' }),
        }))
        vi.stubGlobal('fetch', fetchMock)

        const req = new Request('http://localhost/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'wecom-webhook',
                msgtype: 'text',
                content: 'hello',
            }),
        })

        const res = await worker.fetch(
            req,
            createEnv({ storedWebhookUrl: 'https://example.com/stored' }),
            {} as ExecutionContext
        )
        expect(res.status).toBe(200)
        expect(fetchMock).toHaveBeenCalledWith(
            'https://example.com/stored',
            expect.objectContaining({
                method: 'POST',
            })
        )
    })

    it('sends a WeChat template message', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                json: async () => ({ access_token: 'token-123' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ errcode: 0, errmsg: 'ok', msgid: 1 }),
            })
        vi.stubGlobal('fetch', fetchMock)

        const req = new Request('http://localhost/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'wechat-template',
                openid: 'openid-1',
                templateId: 'template-1',
                url: 'https://example.com/report',
                data: {
                    first: { value: 'hello' },
                    remark: { value: 'done' },
                },
            }),
        })

        const res = await worker.fetch(
            req,
            createEnv({ templateAppId: 'appid-1', templateSecret: 'secret-1' }),
            {} as ExecutionContext
        )
        expect(res.status).toBe(200)

        const data = await res.json()
        expect(data).toEqual({
            success: true,
            channel: 'wechat-template',
        })
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=appid-1&secret=secret-1'
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=token-123',
            expect.objectContaining({
                method: 'POST',
            })
        )
    })
})
