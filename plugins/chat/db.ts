import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import type { SessionMeta, ChatMessage, TopicRecord, ExpressionRecord, EmojiRecord } from "./types";

/**
 * 聊天数据库接口
 */
export interface ChatDatabase {
  saveSession(meta: SessionMeta): void;
  getSession(id: string): SessionMeta | null;
  saveMessage(msg: ChatMessage): void;
  getMessages(sessionId: string, limit?: number, before?: number): ChatMessage[];
  getMessagesByUser(userId: number, sessionId?: string, limit?: number): ChatMessage[];
  searchMessages(sessionId: string, keyword: string, limit?: number): ChatMessage[];
  updateCompressedContext(sessionId: string, context: string): void;
  deleteSessionMessages(sessionId: string): void;
  // 话题
  saveTopic(topic: TopicRecord): number;
  getTopics(sessionId: string, limit?: number): TopicRecord[];
  updateTopic(id: number, updates: Partial<Pick<TopicRecord, "summary" | "keywords" | "messageCount" | "updatedAt">>): void;
  // 表达学习
  saveExpression(expr: ExpressionRecord): void;
  getExpressions(sessionId: string, limit?: number): ExpressionRecord[];
  getExpressionCount(sessionId: string): number;
  deleteOldestExpressions(sessionId: string, keepCount: number): void;
  // 表情包
  saveEmoji(emoji: EmojiRecord): void;
  getEmojiByEmotion(emotion: string, limit?: number): EmojiRecord[];
  getAllEmojis(): EmojiRecord[];
  incrementEmojiUsage(id: number): void;
  close(): void;
}

/**
 * SQLite 数据库实现
 */
export function initDatabase(): ChatDatabase {
  const dbDir = path.join(process.cwd(), "data", "chat");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "chat.db");
  const db = new Database(dbPath);

  // 开启 WAL 模式提升并发性能
  db.pragma("journal_mode = WAL");

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      compressed_context TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      user_title TEXT,
      group_id INTEGER,
      group_name TEXT,
      timestamp INTEGER NOT NULL,
      message_id INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(session_id, content);

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_topics_session ON topics(session_id, updated_at);

    CREATE TABLE IF NOT EXISTS expressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      situation TEXT NOT NULL,
      style TEXT NOT NULL,
      example TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_expressions_session ON expressions(session_id, created_at);

    CREATE TABLE IF NOT EXISTS emojis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      emotion TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_emojis_emotion ON emojis(emotion);
  `);

  // 预编译语句
  const stmts = {
    upsertSession: db.prepare(`
      INSERT INTO sessions (id, type, target_id, created_at, updated_at, compressed_context)
      VALUES (@id, @type, @targetId, @createdAt, @updatedAt, @compressedContext)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = @updatedAt,
        compressed_context = COALESCE(@compressedContext, compressed_context)
    `),
    getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
    insertMessage: db.prepare(`
      INSERT INTO messages (session_id, role, content, user_id, user_name, user_role, user_title, group_id, group_name, timestamp, message_id)
      VALUES (@sessionId, @role, @content, @userId, @userName, @userRole, @userTitle, @groupId, @groupName, @timestamp, @messageId)
    `),
    getMessages: db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?
    `),
    getMessagesBefore: db.prepare(`
      SELECT * FROM messages WHERE session_id = ? AND timestamp < ? ORDER BY timestamp DESC, id DESC LIMIT ?
    `),
    getMessagesByUser: db.prepare(`
      SELECT * FROM messages WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?
    `),
    getMessagesByUserInSession: db.prepare(`
      SELECT * FROM messages WHERE user_id = ? AND session_id = ? ORDER BY timestamp DESC LIMIT ?
    `),
    updateCompressedContext: db.prepare(`
      UPDATE sessions SET compressed_context = ?, updated_at = ? WHERE id = ?
    `),
    deleteSessionMessages: db.prepare(`
      DELETE FROM messages WHERE session_id = ?
    `),
    resetSessionContext: db.prepare(`
      UPDATE sessions SET compressed_context = NULL, updated_at = ? WHERE id = ?
    `),
    // 消息搜索
    searchMessages: db.prepare(`
      SELECT * FROM messages WHERE session_id = ? AND content LIKE ? ORDER BY timestamp DESC LIMIT ?
    `),
    // 话题
    insertTopic: db.prepare(`
      INSERT INTO topics (session_id, title, keywords, summary, message_count, created_at, updated_at)
      VALUES (@sessionId, @title, @keywords, @summary, @messageCount, @createdAt, @updatedAt)
    `),
    getTopics: db.prepare(`
      SELECT * FROM topics WHERE session_id = ? ORDER BY updated_at DESC LIMIT ?
    `),
    updateTopic: db.prepare(`
      UPDATE topics SET summary = @summary, keywords = @keywords, message_count = @messageCount, updated_at = @updatedAt WHERE id = @id
    `),
    // 表达学习
    insertExpression: db.prepare(`
      INSERT INTO expressions (session_id, user_id, user_name, situation, style, example, created_at)
      VALUES (@sessionId, @userId, @userName, @situation, @style, @example, @createdAt)
    `),
    getExpressions: db.prepare(`
      SELECT * FROM expressions WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
    `),
    getExpressionCount: db.prepare(`
      SELECT COUNT(*) as count FROM expressions WHERE session_id = ?
    `),
    deleteOldestExpressions: db.prepare(`
      DELETE FROM expressions WHERE session_id = ? AND id NOT IN (
        SELECT id FROM expressions WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
      )
    `),
    // 表情包
    insertEmoji: db.prepare(`
      INSERT OR IGNORE INTO emojis (file_name, description, emotion, usage_count, created_at)
      VALUES (@fileName, @description, @emotion, @usageCount, @createdAt)
    `),
    getEmojiByEmotion: db.prepare(`
      SELECT * FROM emojis WHERE emotion = ? ORDER BY usage_count DESC LIMIT ?
    `),
    getAllEmojis: db.prepare(`SELECT * FROM emojis ORDER BY usage_count DESC`),
    incrementEmojiUsage: db.prepare(`
      UPDATE emojis SET usage_count = usage_count + 1 WHERE id = ?
    `),
  };

  return {
    saveSession(meta: SessionMeta): void {
      stmts.upsertSession.run({
        id: meta.id,
        type: meta.type,
        targetId: meta.targetId,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        compressedContext: meta.compressedContext,
      });
    },

    getSession(id: string): SessionMeta | null {
      const row = stmts.getSession.get(id) as any;
      if (!row) return null;
      return {
        id: row.id,
        type: row.type,
        targetId: row.target_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        compressedContext: row.compressed_context,
      };
    },

    saveMessage(msg: ChatMessage): void {
      stmts.insertMessage.run({
        sessionId: msg.sessionId,
        role: msg.role,
        content: msg.content,
        userId: msg.userId ?? null,
        userName: msg.userName ?? null,
        userRole: msg.userRole ?? null,
        userTitle: msg.userTitle ?? null,
        groupId: msg.groupId ?? null,
        groupName: msg.groupName ?? null,
        timestamp: msg.timestamp,
        messageId: msg.messageId ?? null,
      });
    },

    getMessages(sessionId: string, limit: number = 30, before?: number): ChatMessage[] {
      const rows = before
        ? (stmts.getMessagesBefore.all(sessionId, before, limit) as any[])
        : (stmts.getMessages.all(sessionId, limit) as any[]);

      return rows
        .map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          userId: row.user_id,
          userName: row.user_name,
          userRole: row.user_role,
          userTitle: row.user_title,
          groupId: row.group_id,
          groupName: row.group_name,
          timestamp: row.timestamp,
          messageId: row.message_id,
        }))
        .reverse(); // 按时间正序
    },

    getMessagesByUser(userId: number, sessionId?: string, limit: number = 20): ChatMessage[] {
      const rows = sessionId
        ? (stmts.getMessagesByUserInSession.all(userId, sessionId, limit) as any[])
        : (stmts.getMessagesByUser.all(userId, limit) as any[]);

      return rows
        .map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          userId: row.user_id,
          userName: row.user_name,
          userRole: row.user_role,
          userTitle: row.user_title,
          groupId: row.group_id,
          groupName: row.group_name,
          timestamp: row.timestamp,
          messageId: row.message_id,
        }))
        .reverse();
    },

    updateCompressedContext(sessionId: string, context: string): void {
      stmts.updateCompressedContext.run(context, Date.now(), sessionId);
    },

    deleteSessionMessages(sessionId: string): void {
      stmts.deleteSessionMessages.run(sessionId);
      stmts.resetSessionContext.run(Date.now(), sessionId);
    },

    searchMessages(sessionId: string, keyword: string, limit: number = 20): ChatMessage[] {
      const rows = stmts.searchMessages.all(sessionId, `%${keyword}%`, limit) as any[];
      return rows
        .map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          userId: row.user_id,
          userName: row.user_name,
          userRole: row.user_role,
          userTitle: row.user_title,
          groupId: row.group_id,
          groupName: row.group_name,
          timestamp: row.timestamp,
          messageId: row.message_id,
        }))
        .reverse();
    },

    saveTopic(topic: TopicRecord): number {
      const result = stmts.insertTopic.run({
        sessionId: topic.sessionId,
        title: topic.title,
        keywords: topic.keywords,
        summary: topic.summary,
        messageCount: topic.messageCount,
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
      });
      return Number(result.lastInsertRowid);
    },

    getTopics(sessionId: string, limit: number = 10): TopicRecord[] {
      const rows = stmts.getTopics.all(sessionId, limit) as any[];
      return rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        title: row.title,
        keywords: row.keywords,
        summary: row.summary,
        messageCount: row.message_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },

    updateTopic(id: number, updates: Partial<Pick<TopicRecord, "summary" | "keywords" | "messageCount" | "updatedAt">>): void {
      // 先获取当前值用于合并
      const current = db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as any;
      if (!current) return;
      stmts.updateTopic.run({
        id,
        summary: updates.summary ?? current.summary,
        keywords: updates.keywords ?? current.keywords,
        messageCount: updates.messageCount ?? current.message_count,
        updatedAt: updates.updatedAt ?? Date.now(),
      });
    },

    saveExpression(expr: ExpressionRecord): void {
      stmts.insertExpression.run({
        sessionId: expr.sessionId,
        userId: expr.userId,
        userName: expr.userName,
        situation: expr.situation,
        style: expr.style,
        example: expr.example,
        createdAt: expr.createdAt,
      });
    },

    getExpressions(sessionId: string, limit: number = 50): ExpressionRecord[] {
      const rows = stmts.getExpressions.all(sessionId, limit) as any[];
      return rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        userName: row.user_name,
        situation: row.situation,
        style: row.style,
        example: row.example,
        createdAt: row.created_at,
      }));
    },

    getExpressionCount(sessionId: string): number {
      const row = stmts.getExpressionCount.get(sessionId) as any;
      return row?.count ?? 0;
    },

    deleteOldestExpressions(sessionId: string, keepCount: number): void {
      stmts.deleteOldestExpressions.run(sessionId, sessionId, keepCount);
    },

    saveEmoji(emoji: EmojiRecord): void {
      stmts.insertEmoji.run({
        fileName: emoji.fileName,
        description: emoji.description,
        emotion: emoji.emotion,
        usageCount: emoji.usageCount ?? 0,
        createdAt: emoji.createdAt,
      });
    },

    getEmojiByEmotion(emotion: string, limit: number = 5): EmojiRecord[] {
      const rows = stmts.getEmojiByEmotion.all(emotion, limit) as any[];
      return rows.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        description: row.description,
        emotion: row.emotion,
        usageCount: row.usage_count,
        createdAt: row.created_at,
      }));
    },

    getAllEmojis(): EmojiRecord[] {
      const rows = stmts.getAllEmojis.all() as any[];
      return rows.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        description: row.description,
        emotion: row.emotion,
        usageCount: row.usage_count,
        createdAt: row.created_at,
      }));
    },

    incrementEmojiUsage(id: number): void {
      stmts.incrementEmojiUsage.run(id);
    },

    close(): void {
      db.close();
    },
  };
}
