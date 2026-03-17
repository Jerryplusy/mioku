import type { MiokiContext } from "mioki";
import type { AITool } from "../../src";
import type { ChatDatabase } from "./db";

/**
 * 人格状态配置
 */
export interface PersonalityConfig {
  states: string[];
  stateProbability: number; // 切换到其他状态的概率 (0-1)
}

/**
 * 回复风格配置
 */
export interface ReplyStyleConfig {
  baseStyle: string;
  multipleStyles: string[];
  multipleProbability: number; // 使用特殊风格的概率 (0-1)
}

/**
 * 记忆检索配置
 */
export interface MemoryConfig {
  enabled: boolean;
  maxIterations: number; // ReAct 最大迭代次数
  timeoutMs: number; // 检索超时
}

/**
 * 话题跟踪配置
 */
export interface TopicConfig {
  enabled: boolean;
  messageThreshold: number; // 触发话题检查的消息数
  timeThresholdMs: number; // 触发话题检查的时间间隔
  maxTopicsPerSession: number;
}

/**
 * 动作规划器配置
 */
export interface PlannerConfig {
  enabled: boolean;
  idleThresholdMs: number; // 群聊空闲时间阈值（毫秒）
  idleMessageCount: number; // 群聊记录保底消息数量
  idleCheckBotIds: number[]; // 空闲检查的 bot ID 列表
}

/**
 * 错别字生成器配置
 */
export interface TypoConfig {
  enabled: boolean;
  errorRate: number; // 单字替换概率 (0-1)
  wordReplaceRate: number; // 整词替换概率 (0-1)
}

/**
 * 表情包系统配置
 */
export interface EmojiConfig {
  enabled: boolean;
  replyProbability: number;
  characters: string[];
  useAISelection: boolean;
}

/**
 * 表达学习配置
 */
export interface ExpressionConfig {
  enabled: boolean;
  maxExpressions: number; // 最大学习表达数
  sampleSize: number; // 每次注入 prompt 的表达数
}

/**
 * 动态延迟配置
 * 根据互动人数动态调整回复延迟
 */
export interface DynamicDelayConfig {
  enabled: boolean;
  interactionWindowMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * SearXNG 网页搜索配置
 */
export interface SearxngConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  defaultLimit: number;
  maxLimit: number;
}

/**
 * 聊天插件配置
 */
export interface ChatConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  workingModel: string;
  multimodalWorkingModel: string;
  isMultimodal: boolean;
  nicknames: string[];
  persona: string;
  maxContextTokens: number;
  temperature: number;
  searxng: SearxngConfig;
  historyCount: number;
  blacklistGroups: number[];
  whitelistGroups: number[];
  imageAnalysisBlacklistUsers: number[];
  maxSessions: number;
  maxIterations: number;
  enableGroupAdmin: boolean;
  enableExternalSkills: boolean;
  cooldownAfterReplyMs: number;
  dynamicDelay: DynamicDelayConfig;
  personality: PersonalityConfig;
  replyStyle: ReplyStyleConfig;
  memory: MemoryConfig;
  topic: TopicConfig;
  planner: PlannerConfig;
  typo: TypoConfig;
  emoji: EmojiConfig;
  expression: ExpressionConfig;
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
  content: string; // 存储时统一为字符串
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
 * 触发消息
 */
export interface TargetMessage {
  userName: string;
  userId: number;
  userRole: string;
  userTitle?: string;
  content: string;
  messageId?: number;
  timestamp: number;
}

/**
 * 技能会话（per group session）
 */
export interface SkillSession {
  skillName: string;
  tools: Map<string, AITool>;
  loadedAt: number;
  expiresAt: number; // loadedAt + 1h
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
  /**
   * 当 AI 返回文本内容时立即调用（不等待工具调用完成）
   * 回调接收文本内容、消息索引、总消息数
   */
  onTextContent?: (
    text: string,
    messageIndex: number,
    totalMessages: number,
  ) => void | Promise<void>;
  /**
   * 已通过 onTextContent 回调发送的消息索引集合
   */
  sentMessageIndices?: Set<number>;
  /**
   * 待附加到下一轮 AI 请求的图片 URL
   */
  pendingImageUrls?: string[];
}

/**
 * 聊天结果
 */
export interface ChatResult {
  messages: string[];
  pendingAt: number[];
  pendingPoke: number[];
  pendingQuote?: number;
  toolCalls: { name: string; args: any; result: any }[];
  emojiPath?: string | null;
}

// ==================== 真人化系统数据类型 ====================

/**
 * 话题记录
 */
export interface TopicRecord {
  id?: number;
  sessionId: string;
  title: string;
  keywords: string; // JSON array
  summary: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 表达习惯记录
 */
export interface ExpressionRecord {
  id?: number;
  sessionId: string;
  userId: number;
  userName: string;
  situation: string; // 使用场景
  style: string; // 表达风格
  example: string; // 原始示例
  createdAt: number;
}

/**
 * 表情包注册记录
 */
export interface EmojiRecord {
  id?: number;
  fileName: string;
  description: string; // AI 生成的描述
  emotion: string; // 情感标签
  usageCount: number;
  createdAt: number;
}

/**
 * 图片记录
 */
export interface ImageRecord {
  id?: number;
  hash: string; // 图片哈希
  url: string; // 原始 URL
  type: "meme" | "image"; // 图片类型
  description: string; // AI 生成的简要描述
  emotion?: string; // 情感标签（仅表情包）
  character?: string; // 角色名称（仅表情包）
  filePath?: string; // 本地文件路径（仅表情包）
  createdAt: number;
}

/**
 * 动作规划结果
 */
export type PlannerAction = "reply" | "wait" | "complete";

export interface PlannerResult {
  action: PlannerAction;
  reason: string;
  waitMs?: number; // action=wait 时的等待时间
}
