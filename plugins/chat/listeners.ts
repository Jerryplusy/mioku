import type { MiokiContext } from "mioki";
import type { AITool } from "../../src";
import type {
  OneTimeListener,
  ContinuousListener,
  ToolCallResult,
} from "./types";
import { SessionStore } from "./session-store";

/** 连续会话监听器存储 */
const continuousListeners = new Map<string, ContinuousListener>();

/** 创建监听器相关工具 */
export function createListenerTools(
  ctx: MiokiContext,
  sessionStore: SessionStore,
  sessionId: string,
): AITool[] {
  return [
    {
      name: "register_listener",
      description:
        "注册一次性监听器，等待特定条件触发后唤醒。注意：你也会累，不要连续使用这个功能。同一会话最多1个监听器。",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["user_speak", "message_count"],
            description:
              "监听类型：user_speak等待特定用户发言，message_count等待N条消息后触发",
          },
          targetUserId: {
            type: "number",
            description: "等待发言的用户QQ号（type=user_speak时必填）",
          },
          messageCount: {
            type: "number",
            description: "等待的消息数量（type=message_count时必填，最大10）",
          },
          timeoutMinutes: {
            type: "number",
            description: "超时时间（分钟），默认5分钟，最大30分钟",
          },
        },
        required: ["type"],
      },
      handler: async (args: {
        type: "user_speak" | "message_count";
        targetUserId?: number;
        messageCount?: number;
        timeoutMinutes?: number;
      }): Promise<ToolCallResult> => {
        // 检查是否已有监听器
        const existing = sessionStore.getListener(sessionId);
        if (existing) {
          return {
            success: false,
            message: "当前会话已有一个监听器，请等待它触发或过期",
          };
        }

        // 验证参数
        if (args.type === "user_speak" && !args.targetUserId) {
          return {
            success: false,
            message: "等待用户发言需要指定targetUserId",
          };
        }
        if (args.type === "message_count" && !args.messageCount) {
          return {
            success: false,
            message: "等待消息数量需要指定messageCount",
          };
        }

        const timeout = Math.min(args.timeoutMinutes ?? 5, 30) * 60 * 1000;
        const messageCount = args.messageCount
          ? Math.min(args.messageCount, 10)
          : undefined;

        const listenerId = `listener:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();

        sessionStore.addListener({
          id: listenerId,
          sessionId,
          type: args.type,
          targetUserId: args.targetUserId,
          messageCount,
          currentCount: 0,
          createdAt: now,
          expiresAt: now + timeout,
        });

        return {
          success: true,
          message:
            args.type === "user_speak"
              ? `已注册监听器，等待用户 ${args.targetUserId} 发言`
              : `已注册监听器，等待 ${messageCount} 条消息后触发`,
          data: { listenerId },
        };
      },
      returnToAI: false,
    },
  ];
}

/** 检查一次性监听器是否触发 */
export function checkOneTimeListener(
  sessionStore: SessionStore,
  sessionId: string,
  userId: number,
): { triggered: boolean; listener?: OneTimeListener } {
  const listener = sessionStore.getListener(sessionId);
  if (!listener) return { triggered: false };

  // 检查是否过期
  if (listener.expiresAt < Date.now()) {
    sessionStore.removeListener(listener.id);
    return { triggered: false };
  }

  if (listener.type === "user_speak") {
    if (listener.targetUserId === userId) {
      sessionStore.removeListener(listener.id);
      return { triggered: true, listener };
    }
  } else if (listener.type === "message_count") {
    const newCount = sessionStore.incrementListenerCount(listener.id);
    if (newCount >= (listener.messageCount ?? 1)) {
      sessionStore.removeListener(listener.id);
      return { triggered: true, listener };
    }
  }

  return { triggered: false };
}

/** 注册连续会话监听器 */
export function registerContinuousListener(
  sessionId: string,
  lastAssistantMessage: string,
  timeoutMs: number = 30000,
) {
  continuousListeners.set(sessionId, {
    sessionId,
    lastAssistantMessage,
    createdAt: Date.now(),
    expiresAt: Date.now() + timeoutMs,
  });

  // 自动清理
  setTimeout(() => {
    const listener = continuousListeners.get(sessionId);
    if (listener && listener.expiresAt <= Date.now()) {
      continuousListeners.delete(sessionId);
    }
  }, timeoutMs + 1000);
}

/** 获取连续会话监听器 */
export function getContinuousListener(
  sessionId: string,
): ContinuousListener | undefined {
  const listener = continuousListeners.get(sessionId);
  if (!listener) return undefined;

  if (listener.expiresAt < Date.now()) {
    continuousListeners.delete(sessionId);
    return undefined;
  }

  return listener;
}

/** 移除连续会话监听器 */
export function removeContinuousListener(sessionId: string) {
  continuousListeners.delete(sessionId);
}

/** 创建判断相关性的工具 */
export function createRelevanceCheckTool(): AITool {
  return {
    name: "check_relevance",
    description: "判断用户的新消息是否与之前的对话相关",
    parameters: {
      type: "object",
      properties: {
        isRelevant: {
          type: "boolean",
          description: "消息是否与之前的对话相关",
        },
        reason: {
          type: "string",
          description: "判断理由（简短）",
        },
      },
      required: ["isRelevant"],
    },
    handler: async (args: { isRelevant: boolean; reason?: string }) => {
      return { isRelevant: args.isRelevant, reason: args.reason };
    },
    returnToAI: false,
  };
}
