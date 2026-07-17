import { describe, expect, it } from 'vitest'
import {
    assetExpiration,
    CloudflareTaskHistoryService,
    decodeTaskImageDataUrl,
} from '../service'

describe('task history image validation', () => {
    it('decodes supported image data URLs', () => {
        const image = decodeTaskImageDataUrl(
            'data:image/png;base64,aW1hZ2U=',
        )
        expect(image.contentType).toBe('image/png')
        expect(new TextDecoder().decode(image.bytes)).toBe('image')
        expect(image.extension).toBe('png')
    })

    it('rejects unsupported and oversized images', () => {
        expect(() => decodeTaskImageDataUrl(
            'data:image/gif;base64,aW1hZ2U=',
        )).toThrow('UNSUPPORTED_IMAGE')
        expect(() => decodeTaskImageDataUrl(
            'data:image/png;base64,aW1hZ2U=',
            4,
        )).toThrow('FILE_TOO_LARGE')
    })

    it('expires task images after 30 days', () => {
        expect(assetExpiration(1000)).toBe(
            1000 + 30 * 24 * 60 * 60 * 1000,
        )
    })

    it('does not follow provider redirects while archiving', async () => {
        let redirectMode = ''
        const service = new CloudflareTaskHistoryService(
            {} as any,
            async (_url, init) => {
                redirectMode = String(init?.redirect)
                return new Response(null, {
                    status: 302,
                    headers: { Location: 'http://127.0.0.1/private' },
                })
            },
        )

        await expect(service.archiveRemoteImage(
            { userId: 'anon_1' } as any,
            'output',
            'https://images.example/result.png',
        )).rejects.toThrow('Result image download failed (302)')
        expect(redirectMode).toBe('manual')
    })
})
