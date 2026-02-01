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

/**
 * TODO 任务表
 */
export const todoTasks = sqliteTable('todo_tasks', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().$defaultFn(() => 'pending'), // pending/completed
    dueDate: text('due_date'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    vectorId: text('vector_id'), // Vectorize 向量ID
})

/**
 * 邮件转发规则表
 */
export const emailRules = sqliteTable('email_rules', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    matchType: text('match_type').notNull(), // 'sender', 'subject', 'all'
    matchValue: text('match_value'), // Regex or string
    forwardToWecom: integer('forward_to_wecom', { mode: 'boolean' }).notNull().default(true),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

/**
 * 企业微信配置表
 */
export const wecomConfig = sqliteTable('wecom_config', {
    key: text('key').primaryKey(), // 'wecom_webhook_url'
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
