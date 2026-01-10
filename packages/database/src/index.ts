import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export * from './schema'

/**
 * 初始化数据库客户端
 */
export function initDB(d1: D1Database) {
    return drizzle(d1, { schema })
}
