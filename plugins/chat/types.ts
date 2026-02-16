import type { MiokiContext } from "mioki";
import type { AIService } from "../../src/services/ai";
import type { ChatDatabase } from "./db";

/**
 * 聊天插件配置
 */
export interface ChatConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isMultimodal: boolean;
  nicknames: string[];
  persona: string;
  maxContextTokens: number; // 单位 K，例如 128 = 128K
  temperature: number;
  blacklistGroups: number[];
  whitelistGroups: number[];
  maxSessions: number;
  enableGroupAdmin: boolean;
  enableExternalSkills: boolean;
}

/**
 * 会话类型
 */
export type SessionType = "group" | "personal";

/**
 * 会话元数据
 */
export interface SessionMeta {
  id: string; // "group:{group_id}" 或 "personal:{user_id}"
  type: SessionType;
  targetId: number; // group_id 或 user_id
  createdAt: number;
  updatedAt: number;
  compressedContext: string | null;
}

/**
 * 聊天消息记录
 */
export interface ChatMessage {
  id?: number;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  userId?: number;
  userName?: string;
  userRole?: string; // "owner" | "admin" | "member"
  userTitle?: string;
  groupId?: number;
  groupName?: string;
  timestamp: number;
  messageId?: number; // QQ message_id
}

/**
 * 一次性监听器
 */
export interface OneTimeListener {
  sessionId: string;
  type: "next_user_message" | "message_count";
  userId?: number;
  count?: number;
  currentCount?: number;
  reason: string;
  createdAt: number;
  timeoutMs: number;
  cooldownUntil: number;
  cancel: () => void;
}

/**
 * 连续会话监听器
 */
export interface ContinuousListener {
  sessionId: string;
  groupId: number;
  lastAssistantContent: string;
  lastMessageId?: number;
  createdAt: number;
  cancel: () => void;
}

/**
 * 工具上下文
 */
export interface ToolContext {
  ctx: MiokiContext;
  event: any;
  sessionId: string;
  groupId?: number;
  userId: number;
  config: ChatConfig;
  aiService: AIService;
  db: ChatDatabase;
  botRole: "owner" | "admin" | "member";
}
