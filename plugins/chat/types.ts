import type { MultimodalContentItem } from "../../src/services/ai";

/** 插件配置 */
export interface ChatConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isMultimodal: boolean;
  nicknames: string[];
  persona: string;
  maxContextTokens: number; // K为单位，如200表示200K
  temperature: number;
  blacklistGroups: number[];
  whitelistGroups: number[];
  maxSessions: number;
  enableGroupAdmin: boolean;
  enableExternalSkills: boolean;
}

/** 消息类型 */
export type MessageType = "text" | "image" | "video" | "audio" | "at" | "quote";

/** 消息段 */
export interface MessageSegment {
  type: MessageType;
  data: {
    text?: string;
    url?: string;
    qq?: number;
    messageId?: string;
  };
}

/** 会话消息 */
export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | MultimodalContentItem[];
  senderId?: number;
  senderName?: string;
  senderRole?: "owner" | "admin" | "member";
  groupId?: number;
  groupName?: string;
  timestamp: number;
  tokenCount?: number;
}

/** 会话类型 */
export type SessionType = "group" | "private";

/** 会话数据 */
export interface Session {
  id: string;
  type: SessionType;
  targetId: number; // 群号或用户QQ
  userId?: number; // 私人会话的用户ID
  messages: SessionMessage[];
  totalTokens: number;
  createdAt: number;
  updatedAt: number;
  lastAccessAt: number;
}

/** 一次性监听器 */
export interface OneTimeListener {
  id: string;
  sessionId: string;
  type: "user_speak" | "message_count";
  targetUserId?: number;
  messageCount?: number;
  currentCount?: number;
  createdAt: number;
  expiresAt: number;
}

/** 连续会话监听器 */
export interface ContinuousListener {
  sessionId: string;
  lastAssistantMessage: string;
  createdAt: number;
  expiresAt: number;
}

/** 限流记录 */
export interface RateLimitRecord {
  userId: number;
  timestamps: number[];
}

/** 踢人确认请求 */
export interface KickConfirmation {
  id: string;
  groupId: number;
  targetUserId: number;
  requesterId: number;
  createdAt: number;
  expiresAt: number;
  confirmed: boolean;
  confirmedBy?: number;
}

/** 发送消息参数 */
export interface SendMessageArgs {
  segments: Array<{
    type: "text" | "at" | "quote";
    text?: string;
    qq?: number;
    messageId?: string;
  }>;
}

/** 群管操作类型 */
export type AdminAction = "ban" | "kick" | "set_card" | "set_title" | "mute_all";

/** 群成员信息 */
export interface GroupMemberContext {
  userId: number;
  nickname: string;
  card: string;
  title: string;
  role: "owner" | "admin" | "member";
  joinTime: number;
  lastSpeakTime: number;
}

/** 消息上下文 */
export interface MessageContext {
  messageId: string;
  groupId?: number;
  groupName?: string;
  groupMemberCount?: number;
  userId: number;
  userNickname: string;
  userCard?: string;
  userTitle?: string;
  userRole: "owner" | "admin" | "member";
  isAtBot: boolean;
  isQuoteBot: boolean;
  hasNickname: boolean;
  timestamp: number;
  rawMessage: string;
  segments: MessageSegment[];
}

/** AI工具调用结果 */
export interface ToolCallResult {
  success: boolean;
  message?: string;
  data?: any;
}
