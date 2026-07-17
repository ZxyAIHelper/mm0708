export type AnonymousUser = {
    id: string
    createdAt: number
    lastSeenAt: number
}

export type TaskStatus = 'processing' | 'completed' | 'failed'

export type TaskAssetRole =
    | 'target'
    | 'product'
    | 'scene'
    | 'previous'
    | 'output'

export type TaskHistoryEnv = {
    DB: D1Database
    TASK_ASSETS: R2Bucket
}

