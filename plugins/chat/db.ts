import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import type { SessionMeta, ChatMessage } from "./types";

/**
 * 聊天数据库接口
 */
export interface ChatDatabase {
  saveSession(meta: SessionMeta): void;
  getSession(id: string): SessionMeta | null;
  saveMessage(msg: ChatMessage): void;
  getMessages(sessionId: string, limit?: number, before?: number): ChatMessage[];
  getMessagesByUser(userId: number, sessionId?: string, limit?: number): ChatMessage[];
  updateCompressedContext(sessionId: string, context: string): void;
  deleteSessionMessages(sessionId: string): void;
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

    close(): void {
      db.close();
    },
  };
}
