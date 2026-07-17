import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createVolcanoProductSwapProvider } from '../volcano-provider'

const runLive =
    process.env.RUN_LIVE_PRODUCT_SWAP === '1'
    && Boolean(process.env.DOUBAO_API_KEY)

function imageDataUrl(fileName: string): string {
    const filePath = path.resolve(
        process.cwd(),
        '..',
        'product-swap',
        'assets',
        fileName,
    )
    return `data:image/jpeg;base64,${
        readFileSync(filePath).toString('base64')
    }`
}

describe.skipIf(!runLive)('live Volcano product swap', () => {
    it('generates a real replacement image', async () => {
        const result = await createVolcanoProductSwapProvider()
            .generate({
                targetImage: imageDataUrl('example-template.jpg'),
                productImage: imageDataUrl('example-product.jpg'),
                requirements: '保持三份排列和黑色背景',
                requestId: 'swap_live_smoke',
                messages: [],
            }, {
                DOUBAO_API_KEY: process.env.DOUBAO_API_KEY,
                DOUBAO_CHAT_ENDPOINT:
                    'ep-20260716231326-d56zl',
                DOUBAO_IMAGE_ENDPOINT_ID:
                    'ep-20260107231748-q2sw8',
            })

        expect(result.imageUrl).toMatch(/^(https:|data:image\/)/)
    }, 240_000)
})
