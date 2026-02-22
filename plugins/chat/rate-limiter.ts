/**
 * 防滥用限流器
 */
export class RateLimiter {
  // 用户触发记录：userId -> timestamp[]
  private userTriggers: Map<number, number[]> = new Map();
  // 用户最近消息：userId -> {content, timestamp}[]
  private userMessages: Map<number, { content: string; timestamp: number }[]> =
    new Map();
  // 群组最后响应时间：groupId -> timestamp
  private groupLastResponse: Map<number, number> = new Map();

  private readonly maxTriggersPerWindow: number;
  private readonly windowMs: number;
  private readonly dedupWindowMs: number;
  private readonly groupCooldownMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options?: {
    maxTriggersPerWindow?: number;
    windowMs?: number;
    dedupWindowMs?: number;
    groupCooldownMs?: number;
  }) {
    this.maxTriggersPerWindow = options?.maxTriggersPerWindow ?? 5;
    this.windowMs = options?.windowMs ?? 60_000;
    this.dedupWindowMs = options?.dedupWindowMs ?? 30_000;
    this.groupCooldownMs = options?.groupCooldownMs ?? 1_000;

    // 每 5 分钟清理过期数据
    this.cleanupTimer = setInterval(() => this.cleanup(), 300_000);
  }

  /**
   * 检查是否可以处理此消息
   */
  canProcess(
    userId: number,
    groupId: number | undefined,
    content: string,
  ): boolean {
    const now = Date.now();

    // 1. 群组冷却检查
    if (groupId) {
      const lastResponse = this.groupLastResponse.get(groupId);
      if (lastResponse && now - lastResponse < this.groupCooldownMs) {
        return false;
      }
    }

    // 2. 用户频率检查
    const triggers = this.userTriggers.get(userId) ?? [];
    const recentTriggers = triggers.filter((t) => now - t < this.windowMs);
    if (recentTriggers.length >= this.maxTriggersPerWindow) {
      return false;
    }

    // 3. 重复消息检查
    const messages = this.userMessages.get(userId) ?? [];
    const recentSame = messages.find(
      (m) => m.content === content && now - m.timestamp < this.dedupWindowMs,
    );
    return !recentSame;
  }

  /**
   * 记录已处理的消息
   */
  record(userId: number, groupId: number | undefined, content: string): void {
    const now = Date.now();

    // 记录触发
    const triggers = this.userTriggers.get(userId) ?? [];
    triggers.push(now);
    this.userTriggers.set(userId, triggers);

    // 记录消息（只保留最近 3 条）
    const messages = this.userMessages.get(userId) ?? [];
    messages.push({ content, timestamp: now });
    if (messages.length > 3) messages.shift();
    this.userMessages.set(userId, messages);

    // 记录群组响应
    if (groupId) {
      this.groupLastResponse.set(groupId, now);
    }
  }

  /**
   * 清理过期数据
   */
  cleanup(): void {
    const now = Date.now();

    for (const [userId, triggers] of this.userTriggers) {
      const valid = triggers.filter((t) => now - t < this.windowMs);
      if (valid.length === 0) {
        this.userTriggers.delete(userId);
      } else {
        this.userTriggers.set(userId, valid);
      }
    }

    for (const [userId, messages] of this.userMessages) {
      const valid = messages.filter(
        (m) => now - m.timestamp < this.dedupWindowMs,
      );
      if (valid.length === 0) {
        this.userMessages.delete(userId);
      } else {
        this.userMessages.set(userId, valid);
      }
    }

    for (const [groupId, timestamp] of this.groupLastResponse) {
      if (now - timestamp > this.groupCooldownMs * 10) {
        this.groupLastResponse.delete(groupId);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    this.userTriggers.clear();
    this.userMessages.clear();
    this.groupLastResponse.clear();
  }
}
