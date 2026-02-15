import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import type {
  Session,
  SessionMessage,
  OneTimeListener,
  SessionType,
} from "./types";

const DB_PATH = path.join(__dirname, "../../data/chat.db");

export class SessionStore {
  private db: Database.Database;
  private readonly maxSessions: number;
  private sessionCache: Map<string, { session: Session; accessTime: number }> =
    new Map();

  constructor(maxSessions: number = 100) {
    this.maxSessions = maxSessions;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        user_id INTEGER,
        total_tokens INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_access_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sender_id INTEGER,
        sender_name TEXT,
        sender_role TEXT,
        group_id INTEGER,
        group_name TEXT,
        timestamp INTEGER NOT NULL,
        token_count INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS listeners (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        target_user_id INTEGER,
        message_count INTEGER,
        current_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_target ON sessions(type, target_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_access ON sessions(last_access_at);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_listeners_session ON listeners(session_id);
    `);
  }

  static generateSessionId(
    type: SessionType,
    targetId: number,
    userId?: number,
  ): string {
    if (type === "group") {
      return `group:${targetId}`;
    }
    return `private:${userId}`;
  }

  getOrCreateSession(
    type: SessionType,
    targetId: number,
    userId?: number,
  ): Session {
    const id = SessionStore.generateSessionId(type, targetId, userId);

    const cached = this.sessionCache.get(id);
    if (cached) {
      cached.accessTime = Date.now();
      this.updateLastAccess(id);
      return cached.session;
    }

    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as any;

    if (row) {
      const messages = this.loadMessages(id);
      const session: Session = {
        id: row.id,
        type: row.type,
        targetId: row.target_id,
        userId: row.user_id,
        messages,
        totalTokens: row.total_tokens,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessAt: Date.now(),
      };
      this.cacheSession(session);
      this.updateLastAccess(id);
      return session;
    }

    const now = Date.now();
    const session: Session = {
      id,
      type,
      targetId,
      userId,
      messages: [],
      totalTokens: 0,
      createdAt: now,
      updatedAt: now,
      lastAccessAt: now,
    };

    this.db
      .prepare(
        `
      INSERT INTO sessions (id, type, target_id, user_id, total_tokens, created_at, updated_at, last_access_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, type, targetId, userId ?? null, 0, now, now, now);

    this.cacheSession(session);
    this.enforceLRU();
    return session;
  }

  addMessage(
    sessionId: string,
    message: Omit<SessionMessage, "id">,
  ): SessionMessage {
    const id = `msg:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const fullMessage: SessionMessage = { id, ...message };

    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

    this.db
      .prepare(
        `
      INSERT INTO messages (id, session_id, role, content, sender_id, sender_name, sender_role, group_id, group_name, timestamp, token_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        sessionId,
        message.role,
        content,
        message.senderId ?? null,
        message.senderName ?? null,
        message.senderRole ?? null,
        message.groupId ?? null,
        message.groupName ?? null,
        message.timestamp,
        message.tokenCount ?? 0,
      );

    const tokenCount = message.tokenCount ?? 0;
    this.db
      .prepare(
        `
      UPDATE sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(tokenCount, Date.now(), sessionId);

    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.session.messages.push(fullMessage);
      cached.session.totalTokens += tokenCount;
      cached.session.updatedAt = Date.now();
    }

    return fullMessage;
  }

  private loadMessages(sessionId: string): SessionMessage[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
      )
      .all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content.startsWith("[")
        ? JSON.parse(row.content)
        : row.content,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderRole: row.sender_role,
      groupId: row.group_id,
      groupName: row.group_name,
      timestamp: row.timestamp,
      tokenCount: row.token_count,
    }));
  }

  private cacheSession(session: Session) {
    this.sessionCache.set(session.id, { session, accessTime: Date.now() });
  }

  private updateLastAccess(sessionId: string) {
    this.db
      .prepare("UPDATE sessions SET last_access_at = ? WHERE id = ?")
      .run(Date.now(), sessionId);
  }

  private enforceLRU() {
    const count = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions")
      .get() as any;
    if (count.count <= this.maxSessions) return;

    const toDelete = count.count - this.maxSessions;
    const oldSessions = this.db
      .prepare(
        `
      SELECT id FROM sessions ORDER BY last_access_at ASC LIMIT ?
    `,
      )
      .all(toDelete) as any[];

    for (const { id } of oldSessions) {
      this.deleteSession(id);
    }
  }

  deleteSession(sessionId: string) {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    this.db
      .prepare("DELETE FROM listeners WHERE session_id = ?")
      .run(sessionId);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    this.sessionCache.delete(sessionId);
  }

  resetSession(sessionId: string) {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    this.db
      .prepare(
        "UPDATE sessions SET total_tokens = 0, updated_at = ? WHERE id = ?",
      )
      .run(Date.now(), sessionId);

    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.session.messages = [];
      cached.session.totalTokens = 0;
    }
  }

  compressSession(sessionId: string, keepCount: number = 20) {
    const messages = this.loadMessages(sessionId);
    if (messages.length <= keepCount) return;

    const toKeep = messages.slice(-keepCount);
    const toDeleteIds = messages.slice(0, -keepCount).map((m) => m.id);

    if (toDeleteIds.length > 0) {
      const placeholders = toDeleteIds.map(() => "?").join(",");
      this.db
        .prepare(`DELETE FROM messages WHERE id IN (${placeholders})`)
        .run(...toDeleteIds);

      const newTotal = toKeep.reduce((sum, m) => sum + (m.tokenCount ?? 0), 0);
      this.db
        .prepare(
          "UPDATE sessions SET total_tokens = ?, updated_at = ? WHERE id = ?",
        )
        .run(newTotal, Date.now(), sessionId);

      const cached = this.sessionCache.get(sessionId);
      if (cached) {
        cached.session.messages = toKeep;
        cached.session.totalTokens = newTotal;
      }
    }
  }

  getUserMessagesAcrossGroups(
    userId: number,
    limit: number = 50,
  ): SessionMessage[] {
    const rows = this.db
      .prepare(
        `
      SELECT m.* FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE s.type = 'group' AND m.sender_id = ?
      ORDER BY m.timestamp DESC LIMIT ?
    `,
      )
      .all(userId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content.startsWith("[")
        ? JSON.parse(row.content)
        : row.content,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderRole: row.sender_role,
      groupId: row.group_id,
      groupName: row.group_name,
      timestamp: row.timestamp,
      tokenCount: row.token_count,
    }));
  }

  addListener(listener: OneTimeListener) {
    this.db
      .prepare("DELETE FROM listeners WHERE session_id = ?")
      .run(listener.sessionId);

    this.db
      .prepare(
        `
      INSERT INTO listeners (id, session_id, type, target_user_id, message_count, current_count, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        listener.id,
        listener.sessionId,
        listener.type,
        listener.targetUserId ?? null,
        listener.messageCount ?? null,
        listener.currentCount ?? 0,
        listener.createdAt,
        listener.expiresAt,
      );
  }

  getListener(sessionId: string): OneTimeListener | null {
    const row = this.db
      .prepare(
        "SELECT * FROM listeners WHERE session_id = ? AND expires_at > ?",
      )
      .get(sessionId, Date.now()) as any;

    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      targetUserId: row.target_user_id,
      messageCount: row.message_count,
      currentCount: row.current_count,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  incrementListenerCount(listenerId: string): number {
    this.db
      .prepare(
        "UPDATE listeners SET current_count = current_count + 1 WHERE id = ?",
      )
      .run(listenerId);
    const row = this.db
      .prepare("SELECT current_count FROM listeners WHERE id = ?")
      .get(listenerId) as any;
    return row?.current_count ?? 0;
  }

  removeListener(listenerId: string) {
    this.db.prepare("DELETE FROM listeners WHERE id = ?").run(listenerId);
  }

  cleanupExpiredListeners() {
    this.db
      .prepare("DELETE FROM listeners WHERE expires_at < ?")
      .run(Date.now());
  }

  close() {
    this.db.close();
  }
}
