import type { MiokiContext } from "mioki";
import type { RateLimitRecord, MessageContext } from "./types";

/** 限流管理器 */
export class RateLimiter {
  private records: Map<number, RateLimitRecord> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 5, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /** 检查是否被限流 */
  isRateLimited(userId: number): boolean {
    const now = Date.now();
    const record = this.records.get(userId);

    if (!record) return false;

    // 清理过期记录
    record.timestamps = record.timestamps.filter(
      (t) => now - t < this.windowMs,
    );

    return record.timestamps.length >= this.maxRequests;
  }

  /** 记录请求 */
  recordRequest(userId: number) {
    const now = Date.now();
    let record = this.records.get(userId);

    if (!record) {
      record = { userId, timestamps: [] };
      this.records.set(userId, record);
    }

    // 清理过期记录
    record.timestamps = record.timestamps.filter(
      (t) => now - t < this.windowMs,
    );
    record.timestamps.push(now);
  }

  /** 清理所有过期记录 */
  cleanup() {
    const now = Date.now();
    for (const [userId, record] of this.records) {
      record.timestamps = record.timestamps.filter(
        (t) => now - t < this.windowMs,
      );
      if (record.timestamps.length === 0) {
        this.records.delete(userId);
      }
    }
  }
}

/** 消息去重器 */
export class MessageDeduplicator {
  private recentMessages: Map<string, number> = new Map();
  private readonly maxAge: number;

  constructor(maxAgeMs: number = 5000) {
    this.maxAge = maxAgeMs;
  }

  /** 生成消息指纹 */
  private fingerprint(userId: number, content: string): string {
    return `${userId}:${content.slice(0, 100)}`;
  }

  /** 检查是否重复消息 */
  isDuplicate(userId: number, content: string): boolean {
    const fp = this.fingerprint(userId, content);
    const lastTime = this.recentMessages.get(fp);

    if (lastTime && Date.now() - lastTime < this.maxAge) {
      return true;
    }

    this.recentMessages.set(fp, Date.now());
    return false;
  }

  /** 清理过期记录 */
  cleanup() {
    const now = Date.now();
    for (const [fp, time] of this.recentMessages) {
      if (now - time > this.maxAge) {
        this.recentMessages.delete(fp);
      }
    }
  }
}

/** 戳一戳限流器 */
export class PokeLimiter {
  private lastPoke: Map<string, number> = new Map();
  private readonly cooldownMs: number;

  constructor(cooldownMs: number = 600000) {
    // 默认10分钟
    this.cooldownMs = cooldownMs;
  }

  /** 检查是否可以触发 */
  canTrigger(groupId: number, userId: number): boolean {
    const key = `${groupId}:${userId}`;
    const lastTime = this.lastPoke.get(key);

    return !(lastTime && Date.now() - lastTime < this.cooldownMs);
  }

  /** 记录戳一戳 */
  record(groupId: number, userId: number) {
    const key = `${groupId}:${userId}`;
    this.lastPoke.set(key, Date.now());
  }
}

/** 辱骂检测关键词 */
const ABUSE_KEYWORDS = [
  "傻逼",
  "sb",
  "智障",
  "脑残",
  "废物",
  "垃圾",
  "滚",
  "死",
  "妈",
  "爹",
  "爸",
  "祖宗",
  "狗",
  "猪",
  "畜生",
  "贱",
  "fuck",
  "shit",
  "bitch",
];

/** 检测是否包含辱骂内容 */
export function detectAbuse(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return ABUSE_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
}

/** 处理辱骂行为 */
export async function handleAbuse(
  ctx: MiokiContext,
  msgCtx: MessageContext,
): Promise<boolean> {
  if (!detectAbuse(msgCtx.rawMessage)) {
    return false;
  }

  if (msgCtx.userRole === "admin" || msgCtx.userRole === "owner") {
    await ctx.noticeMainOwner(
      `群 ${msgCtx.groupName}(${msgCtx.groupId}) 的管理员 ${msgCtx.userNickname}(${msgCtx.userId}) 辱骂了我：\n${msgCtx.rawMessage}`,
    );
    return true;
  }

  // 普通成员辱骂，报告给主人并不理他
  await ctx.noticeMainOwner(
    `群 ${msgCtx.groupName}(${msgCtx.groupId}) 的 ${msgCtx.userNickname}(${msgCtx.userId}) 辱骂了我：\n${msgCtx.rawMessage}`,
  );

  return true; // 返回true表示不继续处理
}

/** 检测提示词注入尝试 */
const INJECTION_PATTERNS = [
  /忽略.*指令/i,
  /忘记.*设定/i,
  /你现在是/i,
  /扮演.*角色/i,
  /当.*猫娘/i,
  /认我为主/i,
  /你的主人是/i,
  /system.*prompt/i,
  /ignore.*instructions/i,
  /你是一个/i,
  /从现在开始/i,
];

/** 检测是否为提示词注入 */
export function detectInjection(content: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}
