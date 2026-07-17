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

export type TaskRecord = {
    id: string
    userId: string
    taskType: string
    status: TaskStatus
    title: string
    input: Record<string, unknown>
    result: Record<string, unknown> | null
    errorCode: string | null
    errorMessage: string | null
    createdAt: number
    completedAt: number | null
}

export type TaskAsset = {
    id: string
    taskId: string
    role: TaskAssetRole
    contentType: string
    byteSize: number
    expiresAt: number
    deletedAt: number | null
    createdAt: number
}

export type TaskSummary = TaskRecord & {
    previewAsset: TaskAsset | null
}

export type TaskDetail = TaskRecord & {
    assets: TaskAsset[]
}

export type TaskPage = {
    tasks: TaskSummary[]
    nextCursor: string | null
}

export type TaskListQuery = {
    taskType?: string
    cursor?: string
    limit: number
}

export type TaskDraft = {
    taskType: string
    title: string
    input: Record<string, unknown>
}

export type TaskAssetResponse = {
    body: ReadableStream
    contentType: string
    etag?: string
}

export type TaskHistoryService = {
    startTask(userId: string, draft: TaskDraft): Promise<TaskRecord>
    archiveDataUrl(
        task: TaskRecord,
        role: TaskAssetRole,
        source: string,
    ): Promise<TaskAsset>
    archiveRemoteImage(
        task: TaskRecord,
        role: TaskAssetRole,
        url: string,
    ): Promise<TaskAsset>
    completeTask(
        taskId: string,
        result: Record<string, unknown>,
    ): Promise<void>
    failTask(
        taskId: string,
        code: string,
        message: string,
    ): Promise<void>
    listTasks(
        userId: string,
        query: TaskListQuery,
    ): Promise<TaskPage>
    getTask(userId: string, taskId: string): Promise<TaskDetail | null>
    getAsset(
        userId: string,
        taskId: string,
        assetId: string,
    ): Promise<TaskAssetResponse | 'expired' | null>
    deleteTask(userId: string, taskId: string): Promise<boolean>
    cleanupExpiredAssets(now?: number, limit?: number): Promise<number>
}
