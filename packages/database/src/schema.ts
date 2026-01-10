import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * 工具使用日志表
 */
export const logs = sqliteTable('logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    toolName: text('tool_name').notNull(),
    action: text('action').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    details: text('details'), // JSON string
})

/**
 * 用户表 (预留用于打卡应用)
 */
export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    wechatOpenid: text('wechat_openid'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

/**
 * 打卡记录表 (预留)
 */
export const checkIns = sqliteTable('check_ins', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
        .notNull()
        .references(() => users.id),
    checkInDate: integer('check_in_date', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    note: text('note'),
})
