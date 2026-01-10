/**
 * API Response Types
 */
export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: string
}

/**
 * Meme Generator Types
 */
export interface MemeGenerateRequest {
    image: string // Base64 encoded image
    prompt: string
    model?: string
}

export interface MemeGenerateResponse {
    data: Array<{
        url: string
        b64_json?: string
    }>
}

/**
 * Tool Log Types
 */
export interface ToolLog {
    id?: number
    toolName: string
    action: string
    timestamp: Date
    details?: string
}

/**
 * User Types
 */
export interface User {
    id?: number
    username: string
    wechatOpenid?: string
    createdAt: Date
}

/**
 * Check-in Types
 */
export interface CheckIn {
    id?: number
    userId: number
    checkInDate: Date
    note?: string
}
