import type { TaskHistoryService } from './types'

export async function runExpiredAssetCleanup(
    service: Pick<TaskHistoryService, 'cleanupExpiredAssets'>,
    now = Date.now(),
    batchSize = 500,
    maxBatches = 4,
) {
    let total = 0
    for (let batch = 0; batch < maxBatches; batch += 1) {
        const deleted = await service.cleanupExpiredAssets(
            now,
            batchSize,
        )
        total += deleted
        if (deleted < batchSize) {
            break
        }
    }
    return total
}

