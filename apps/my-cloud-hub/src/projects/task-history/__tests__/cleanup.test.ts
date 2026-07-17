import { describe, expect, it } from 'vitest'
import { runExpiredAssetCleanup } from '../cleanup'

describe('expired task asset cleanup', () => {
    it('continues in bounded batches until the final partial batch', async () => {
        const calls: Array<{ now: number; limit: number }> = []
        const results = [500, 2]
        const total = await runExpiredAssetCleanup({
            cleanupExpiredAssets: async (now, limit) => {
                calls.push({ now: now ?? 0, limit: limit ?? 0 })
                return results.shift() ?? 0
            },
        }, 1234, 500, 4)

        expect(total).toBe(502)
        expect(calls).toEqual([
            { now: 1234, limit: 500 },
            { now: 1234, limit: 500 },
        ])
    })
})
