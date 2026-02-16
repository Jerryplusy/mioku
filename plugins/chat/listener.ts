import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { OneTimeListener, ContinuousListener, ChatConfig } from "./types";

/**
 * 一次性监听器管理
 */
export class OneTimeListenerManager {
  private listeners: Map<string, OneTimeListener> = new Map();
  private cooldowns: Map<string, number> = new Map(); // sessionId -> cooldownUntil
  private static readonly COOLDOWN_MS = 3 * 60_000; // 3 分钟冷却
  private static readonly MAX_TIMEOUT_MS = 30 * 60_000; // 最长 30 分钟
  private static readonly DEFAULT_TIMEOUT_MS = 10 * 60_000; // 默认 10 分钟

  /**
   * 注册一次性监听器
   */
  register(
    sessionId: string,
    type: "next_user_message" | "message_count",
    options: {
      userId?: number;
      count?: number;
      reason: string;
      timeoutMs?: number;
    },
  ): { success: boolean; error?: string } {
    // 检查是否已存在
    if (this.listeners.has(sessionId)) {
      return { success: false, error: "当前会话已有一个监听器，请等待其完成或过期" };
    }

    // 检查冷却
    const cooldownUntil = this.cooldowns.get(sessionId) ?? 0;
    if (Date.now() < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { success: false, error: `冷却中，还需等待 ${remaining} 秒` };
    }

    const timeoutMs = Math.min(
      options.timeoutMs ?? OneTimeListenerManager.DEFAULT_TIMEOUT_MS,
      OneTimeListenerManager.MAX_TIMEOUT_MS,
    );

    const timer = setTimeout(() => {
      this.remove(sessionId);
    }, timeoutMs);

    const listener: OneTimeListener = {
      sessionId,
      type,
      userId: options.userId,
      count: options.count,
      currentCount: 0,
      reason: options.reason,
      createdAt: Date.now(),
      timeoutMs,
      cooldownUntil: Date.now() + timeoutMs + OneTimeListenerManager.COOLDOWN_MS,
      cancel: () => clearTimeout(timer),
    };

    this.listeners.set(sessionId, listener);
    return { success: true };
  }

  /**
   * 检查事件是否触发监听器
   * 返回触发的监听器，如果触发则自动移除
   */
  check(
    sessionId: string,
    userId: number,
  ): OneTimeListener | null {
    const listener = this.listeners.get(sessionId);
    if (!listener) return null;

    if (listener.type === "next_user_message") {
      // 特定用户的下一条消息
      if (listener.userId && listener.userId !== userId) return null;
      this.remove(sessionId);
      return listener;
    }

    if (listener.type === "message_count") {
      listener.currentCount = (listener.currentCount ?? 0) + 1;
      if (listener.currentCount >= (listener.count ?? 1)) {
        this.remove(sessionId);
        return listener;
      }
    }

    return null;
  }

  /**
   * 移除监听器
   */
  remove(sessionId: string): void {
    const listener = this.listeners.get(sessionId);
    if (listener) {
      listener.cancel();
      this.cooldowns.set(sessionId, listener.cooldownUntil);
      this.listeners.delete(sessionId);
    }
  }

  has(sessionId: string): boolean {
    return this.listeners.has(sessionId);
  }

  dispose(): void {
    for (const listener of this.listeners.values()) {
      listener.cancel();
    }
    this.listeners.clear();
    this.cooldowns.clear();
  }
}

/**
 * 连续对话监听管理
 */
export class ContinuousListenerManager {
  private listeners: Map<string, ContinuousListener> = new Map();
  private static readonly EXPIRE_MS = 60_000; // 60 秒过期

  /**
   * 注册连续对话监听
   */
  register(
    groupId: number,
    sessionId: string,
    lastAssistantContent: string,
    lastMessageId?: number,
  ): void {
    const key = `group:${groupId}`;
    // 先清除旧的
    this.remove(groupId);

    const timer = setTimeout(() => {
      this.remove(groupId);
    }, ContinuousListenerManager.EXPIRE_MS);

    this.listeners.set(key, {
      sessionId,
      groupId,
      lastAssistantContent,
      lastMessageId,
      createdAt: Date.now(),
      cancel: () => clearTimeout(timer),
    });
  }

  /**
   * 检查并消费监听器（取出后立即移除）
   */
  consume(groupId: number): ContinuousListener | null {
    const key = `group:${groupId}`;
    const listener = this.listeners.get(key);
    if (!listener) return null;
    this.remove(groupId);
    return listener;
  }

  /**
   * 使用轻量 AI 调用判断消息是否与上一轮对话相关
   */
  async checkRelevance(
    config: ChatConfig,
    lastAssistantContent: string,
    newMessageContent: string,
  ): Promise<boolean> {
    const client = new OpenAI({
      baseURL: config.apiUrl,
      apiKey: config.apiKey,
    });

    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "is_related",
          description: "判断新消息是否与上一条AI回复相关",
          parameters: {
            type: "object",
            properties: {
              related: {
                type: "boolean",
                description: "是否相关",
              },
            },
            required: ["related"],
          },
        },
      },
    ];

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "判断以下新消息是否是在回应AI的上一条回复。如果新消息是对AI说的、或者和AI说的话题相关，则判定为相关。仅调用 is_related 工具回答。",
      },
      {
        role: "assistant",
        content: lastAssistantContent,
      },
      {
        role: "user",
        content: newMessageContent,
      },
    ];

    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        tools,
        temperature: 0.1,
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.name === "is_related") {
        const args = JSON.parse(toolCall.function.arguments);
        return args.related === true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 移除监听器
   */
  remove(groupId: number): void {
    const key = `group:${groupId}`;
    const listener = this.listeners.get(key);
    if (listener) {
      listener.cancel();
      this.listeners.delete(key);
    }
  }

  dispose(): void {
    for (const listener of this.listeners.values()) {
      listener.cancel();
    }
    this.listeners.clear();
  }
}
