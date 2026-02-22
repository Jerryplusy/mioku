import type { MiokiContext } from "mioki";
import type { AIService } from "../../src/services/ai";
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
}

/**
 * 聊天频率控制配置
 */
export interface FrequencyConfig {
  enabled: boolean;
  minIntervalMs: number; // 最小发言间隔
  maxIntervalMs: number; // 最大发言间隔
  speakProbability: number; // 默认发言概率 (0-1)
  quietHoursStart: number; // 安静时段开始 (0-23)
  quietHoursEnd: number; // 安静时段结束 (0-23)
  quietProbabilityMultiplier: number; // 安静时段概率乘数
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
  emojiDir: string; // 表情包目录
  sendProbability: number; // 发送表情包的概率 (0-1)
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
 * 聊天插件配置
 */
export interface ChatConfig {
  apiUrl: string;
  apiKey: string;
  model: string; // 主模型，用于聊天
  workingModel: string; // 工作模型，用于 planner 等轻量任务
  isMultimodal: boolean;
  nicknames: string[];
  persona: string;
  maxContextTokens: number; // 单位 K，例如 128 = 128K
  temperature: number;
  historyCount: number; // 群聊历史消息数量
  blacklistGroups: number[];
  whitelistGroups: number[];
  maxSessions: number;
  maxIterations: number; // AI 迭代次数限制，-1 表示不限制
  enableGroupAdmin: boolean;
  enableExternalSkills: boolean;
  // 真人化机制配置
  personality: PersonalityConfig;
  replyStyle: ReplyStyleConfig;
  memory: MemoryConfig;
  topic: TopicConfig;
  planner: PlannerConfig;
  frequency: FrequencyConfig;
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
 * 动作规划结果
 */
export type PlannerAction = "reply" | "wait" | "complete";

export interface PlannerResult {
  action: PlannerAction;
  reason: string;
  waitMs?: number; // action=wait 时的等待时间
}
