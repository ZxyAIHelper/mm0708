import type {
    TaskAsset,
    TaskAssetResponse,
    TaskAssetRole,
    TaskDetail,
    TaskDraft,
    TaskHistoryEnv,
    TaskHistoryService,
    TaskListQuery,
    TaskPage,
    TaskRecord,
    TaskStatus,
} from './types'

const INPUT_IMAGE_LIMIT = 10 * 1024 * 1024
const OUTPUT_IMAGE_LIMIT = 20 * 1024 * 1024
const ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1000
const IMAGE_TYPES = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
])

type TaskRow = {
    id: string
    user_id: string
    task_type: string
    status: TaskStatus
    title: string
    input_json: string
    result_json: string | null
    error_code: string | null
    error_message: string | null
    created_at: number
    completed_at: number | null
}
type AssetRow = {
    id: string
    task_id: string
    role: TaskAssetRole
    r2_key: string
    content_type: string
    byte_size: number
    expires_at: number
    deleted_at: number | null
    created_at: number
}

export class TaskHistoryError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message)
        this.name = 'TaskHistoryError'
    }
}

function parseJson(value: string | null) {
    if (!value) {
        return null
    }
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object'
            ? parsed as Record<string, unknown>
            : {}
    } catch {
        return {}
    }
}

function mapTask(row: TaskRow): TaskRecord {
    return {
        id: row.id,
        userId: row.user_id,
        taskType: row.task_type,
        status: row.status,
        title: row.title,
        input: parseJson(row.input_json) ?? {},
        result: parseJson(row.result_json),
        errorCode: row.error_code,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        completedAt: row.completed_at,
    }
}

function mapAsset(row: AssetRow): TaskAsset {
    return {
        id: row.id,
        taskId: row.task_id,
        role: row.role,
        contentType: row.content_type,
        byteSize: row.byte_size,
        expiresAt: row.expires_at,
        deletedAt: row.deleted_at,
        createdAt: row.created_at,
    }
}

export function assetExpiration(createdAt: number) {
    return createdAt + ASSET_TTL_MS
}

export function decodeTaskImageDataUrl(
    source: string,
    maxBytes = INPUT_IMAGE_LIMIT,
) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/
        .exec(source)
    if (!match) {
        throw new TaskHistoryError('INVALID_IMAGE', 'INVALID_IMAGE')
    }
    const contentType = match[1].toLowerCase()
    const extension = IMAGE_TYPES.get(contentType)
    if (!extension) {
        throw new TaskHistoryError(
            'UNSUPPORTED_IMAGE',
            'UNSUPPORTED_IMAGE',
        )
    }
    const binary = atob(match[2].replace(/[\r\n]/g, ''))
    if (binary.length > maxBytes) {
        throw new TaskHistoryError('FILE_TOO_LARGE', 'FILE_TOO_LARGE')
    }
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return { bytes, contentType, extension }
}

function extensionFor(contentType: string) {
    const normalized = contentType.split(';', 1)[0].trim().toLowerCase()
    const extension = IMAGE_TYPES.get(normalized)
    if (!extension) {
        throw new TaskHistoryError(
            'UNSUPPORTED_IMAGE',
            'Unsupported result image type',
        )
    }
    return { contentType: normalized, extension }
}

async function readLimitedBody(
    response: Response,
    maxBytes: number,
) {
    const declaredLength = Number(
        response.headers.get('Content-Length') || 0,
    )
    if (declaredLength > maxBytes) {
        throw new TaskHistoryError(
            'FILE_TOO_LARGE',
            'Result image is too large',
        )
    }
    if (!response.body) {
        throw new TaskHistoryError(
            'INVALID_IMAGE',
            'Result image body is empty',
        )
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) {
            break
        }
        length += value.byteLength
        if (length > maxBytes) {
            await reader.cancel()
            throw new TaskHistoryError(
                'FILE_TOO_LARGE',
                'Result image is too large',
            )
        }
        chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    return bytes
}

function encodeCursor(createdAt: number, id: string) {
    return btoa(JSON.stringify([createdAt, id]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

function decodeCursor(value?: string) {
    if (!value || value.length > 300) {
        return null
    }
    try {
        const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64.padEnd(
            base64.length + (4 - base64.length % 4) % 4,
            '=',
        )
        const parsed = JSON.parse(atob(padded))
        if (
            Array.isArray(parsed)
            && Number.isFinite(parsed[0])
            && typeof parsed[1] === 'string'
        ) {
            return { createdAt: Number(parsed[0]), id: parsed[1] }
        }
    } catch {
        return null
    }
    return null
}

export class CloudflareTaskHistoryService
implements TaskHistoryService {
    constructor(
        private readonly env: TaskHistoryEnv,
        private readonly fetchImpl: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    async startTask(userId: string, draft: TaskDraft) {
        const createdAt = this.now()
        const task: TaskRecord = {
            id: `task_${crypto.randomUUID()}`,
            userId,
            taskType: draft.taskType,
            status: 'processing',
            title: draft.title,
            input: draft.input,
            result: null,
            errorCode: null,
            errorMessage: null,
            createdAt,
            completedAt: null,
        }
        await this.env.DB.prepare(
            `INSERT INTO generation_tasks
             (id, user_id, task_type, status, title, input_json,
              created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
            task.id,
            userId,
            task.taskType,
            task.status,
            task.title,
            JSON.stringify(task.input),
            createdAt,
        ).run()
        return task
    }

    private async archiveBytes(
        task: TaskRecord,
        role: TaskAssetRole,
        bytes: Uint8Array,
        contentType: string,
        extension: string,
    ) {
        const createdAt = this.now()
        const id = `asset_${crypto.randomUUID()}`
        const r2Key = `tasks/${task.userId}/${task.id}/${id}.${extension}`
        await this.env.TASK_ASSETS.put(r2Key, bytes, {
            httpMetadata: { contentType },
        })
        const asset: TaskAsset = {
            id,
            taskId: task.id,
            role,
            contentType,
            byteSize: bytes.byteLength,
            expiresAt: assetExpiration(createdAt),
            deletedAt: null,
            createdAt,
        }
        try {
            await this.env.DB.prepare(
                `INSERT INTO task_assets
                 (id, task_id, role, r2_key, content_type, byte_size,
                  expires_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
                id,
                task.id,
                role,
                r2Key,
                contentType,
                bytes.byteLength,
                asset.expiresAt,
                createdAt,
            ).run()
        } catch (error) {
            await this.env.TASK_ASSETS.delete(r2Key)
            throw error
        }
        return asset
    }

    async archiveDataUrl(
        task: TaskRecord,
        role: TaskAssetRole,
        source: string,
    ) {
        const decoded = decodeTaskImageDataUrl(source)
        return this.archiveBytes(
            task,
            role,
            decoded.bytes,
            decoded.contentType,
            decoded.extension,
        )
    }

    async archiveRemoteImage(
        task: TaskRecord,
        role: TaskAssetRole,
        url: string,
    ) {
        if (url.startsWith('data:')) {
            return this.archiveDataUrl(task, role, url)
        }
        const parsedUrl = new URL(url)
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            throw new TaskHistoryError(
                'INVALID_IMAGE_URL',
                'Invalid result image URL',
            )
        }
        const response = await this.fetchImpl(parsedUrl.toString(), {
            redirect: 'follow',
        })
        if (!response.ok) {
            throw new TaskHistoryError(
                'IMAGE_DOWNLOAD_FAILED',
                `Result image download failed (${response.status})`,
            )
        }
        if (response.url) {
            const finalUrl = new URL(response.url)
            if (
                finalUrl.protocol !== 'https:'
                && finalUrl.protocol !== 'http:'
            ) {
                throw new TaskHistoryError(
                    'INVALID_IMAGE_URL',
                    'Invalid redirected image URL',
                )
            }
        }
        const imageType = extensionFor(
            response.headers.get('Content-Type') || '',
        )
        const bytes = await readLimitedBody(response, OUTPUT_IMAGE_LIMIT)
        return this.archiveBytes(
            task,
            role,
            bytes,
            imageType.contentType,
            imageType.extension,
        )
    }

    async completeTask(
        taskId: string,
        result: Record<string, unknown>,
    ) {
        await this.env.DB.prepare(
            `UPDATE generation_tasks
             SET status = 'completed', result_json = ?, completed_at = ?,
                 error_code = NULL, error_message = NULL
             WHERE id = ?`,
        ).bind(JSON.stringify(result), this.now(), taskId).run()
    }

    async failTask(taskId: string, code: string, message: string) {
        await this.env.DB.prepare(
            `UPDATE generation_tasks
             SET status = 'failed', error_code = ?, error_message = ?,
                 completed_at = ?
             WHERE id = ?`,
        ).bind(code, message.slice(0, 500), this.now(), taskId).run()
    }

    async listTasks(userId: string, query: TaskListQuery) {
        const limit = Math.max(1, Math.min(50, query.limit))
        const cursor = decodeCursor(query.cursor)
        const clauses = ['t.user_id = ?']
        const bindings: unknown[] = [userId]
        if (query.taskType) {
            clauses.push('t.task_type = ?')
            bindings.push(query.taskType)
        }
        if (cursor) {
            clauses.push(
                '(t.created_at < ? OR (t.created_at = ? AND t.id < ?))',
            )
            bindings.push(cursor.createdAt, cursor.createdAt, cursor.id)
        }
        const statement = this.env.DB.prepare(
            `SELECT t.*,
                a.id AS preview_id, a.role AS preview_role,
                a.content_type AS preview_content_type,
                a.byte_size AS preview_byte_size,
                a.expires_at AS preview_expires_at,
                a.deleted_at AS preview_deleted_at,
                a.created_at AS preview_created_at
             FROM generation_tasks t
             LEFT JOIN task_assets a ON a.id = COALESCE(
                (SELECT id FROM task_assets
                 WHERE task_id = t.id AND role = 'output'
                 ORDER BY created_at DESC LIMIT 1),
                (SELECT id FROM task_assets
                 WHERE task_id = t.id AND role = 'target'
                 ORDER BY created_at ASC LIMIT 1)
             )
             WHERE ${clauses.join(' AND ')}
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT ?`,
        ).bind(...bindings, limit + 1)
        const result = await statement.all<TaskRow & {
            preview_id: string | null
            preview_role: TaskAssetRole | null
            preview_content_type: string | null
            preview_byte_size: number | null
            preview_expires_at: number | null
            preview_deleted_at: number | null
            preview_created_at: number | null
        }>()
        const rows = result.results ?? []
        const hasMore = rows.length > limit
        const selected = rows.slice(0, limit)
        const tasks = selected.map((row) => ({
            ...mapTask(row),
            previewAsset: row.preview_id
                ? {
                    id: row.preview_id,
                    taskId: row.id,
                    role: row.preview_role as TaskAssetRole,
                    contentType: row.preview_content_type ?? '',
                    byteSize: row.preview_byte_size ?? 0,
                    expiresAt: row.preview_expires_at ?? 0,
                    deletedAt: row.preview_deleted_at,
                    createdAt: row.preview_created_at ?? row.created_at,
                }
                : null,
        }))
        const last = selected[selected.length - 1]
        return {
            tasks,
            nextCursor: hasMore && last
                ? encodeCursor(last.created_at, last.id)
                : null,
        } satisfies TaskPage
    }

    async getTask(userId: string, taskId: string) {
        const row = await this.env.DB.prepare(
            `SELECT * FROM generation_tasks
             WHERE id = ? AND user_id = ?`,
        ).bind(taskId, userId).first<TaskRow>()
        if (!row) {
            return null
        }
        const assets = await this.env.DB.prepare(
            `SELECT * FROM task_assets
             WHERE task_id = ?
             ORDER BY created_at ASC`,
        ).bind(taskId).all<AssetRow>()
        return {
            ...mapTask(row),
            assets: (assets.results ?? []).map(mapAsset),
        } satisfies TaskDetail
    }

    async getAsset(
        userId: string,
        taskId: string,
        assetId: string,
    ): Promise<TaskAssetResponse | 'expired' | null> {
        const row = await this.env.DB.prepare(
            `SELECT a.* FROM task_assets a
             INNER JOIN generation_tasks t ON t.id = a.task_id
             WHERE a.id = ? AND a.task_id = ? AND t.user_id = ?`,
        ).bind(assetId, taskId, userId).first<AssetRow>()
        if (!row) {
            return null
        }
        if (row.deleted_at || row.expires_at <= this.now()) {
            return 'expired'
        }
        const object = await this.env.TASK_ASSETS.get(row.r2_key)
        if (!object) {
            await this.env.DB.prepare(
                `UPDATE task_assets SET deleted_at = ? WHERE id = ?`,
            ).bind(this.now(), row.id).run()
            return 'expired'
        }
        return {
            body: object.body,
            contentType: row.content_type,
            etag: object.httpEtag,
        }
    }

    async deleteTask(userId: string, taskId: string) {
        const task = await this.getTask(userId, taskId)
        if (!task) {
            return false
        }
        const keys = await this.env.DB.prepare(
            `SELECT r2_key FROM task_assets
             WHERE task_id = ? AND deleted_at IS NULL`,
        ).bind(taskId).all<{ r2_key: string }>()
        const r2Keys = (keys.results ?? []).map((row) => row.r2_key)
        if (r2Keys.length) {
            await this.env.TASK_ASSETS.delete(r2Keys)
        }
        await this.env.DB.prepare(
            `DELETE FROM generation_tasks
             WHERE id = ? AND user_id = ?`,
        ).bind(taskId, userId).run()
        return true
    }

    async cleanupExpiredAssets(
        now = this.now(),
        limit = 500,
    ) {
        const result = await this.env.DB.prepare(
            `SELECT id, r2_key FROM task_assets
             WHERE deleted_at IS NULL AND expires_at <= ?
             ORDER BY expires_at ASC
             LIMIT ?`,
        ).bind(now, Math.max(1, Math.min(1000, limit)))
            .all<{ id: string; r2_key: string }>()
        const rows = result.results ?? []
        if (!rows.length) {
            return 0
        }
        await this.env.TASK_ASSETS.delete(
            rows.map((row) => row.r2_key),
        )
        await this.env.DB.batch(rows.map((row) =>
            this.env.DB.prepare(
                `UPDATE task_assets SET deleted_at = ? WHERE id = ?`,
            ).bind(now, row.id),
        ))
        return rows.length
    }
}
