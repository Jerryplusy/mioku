import type { AIInstance } from "../../../src/services/ai";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig, ChatMessage } from "../types";

export class MemoryRetrieval {
  private ai: AIInstance;
  private config: ChatConfig;
  private db: ChatDatabase;

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.ai = ai;
    this.config = config;
    this.db = db;
  }

  async retrieve(
    sessionId: string,
    currentMessage: string,
    senderName: string,
    recentHistory: ChatMessage[],
  ): Promise<string | null> {
    if (!this.config.memory?.enabled) return null;

    const question = await this.generateQuestion(
      currentMessage,
      senderName,
      recentHistory,
    );
    if (!question) return null;

    logger.info(`[记忆检索] 生成问题: ${question}`);

    const answer = await this.reactSearch(sessionId, question);
    if (!answer) return null;

    logger.info(`[记忆检索] 找到答案: ${answer.substring(0, 100)}...`);
    return answer;
  }

  private async generateQuestion(
    message: string,
    sender: string,
    history: ChatMessage[],
  ): Promise<string | null> {
    const historyText = history
      .slice(-15)
      .map((m) => `${m.userName || "unknown"}: ${m.content}`)
      .join("\n");

    const now = new Date();
    const timeStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    try {
      const result = await this.ai.generateText({
        prompt: `现在是${timeStr}。
群里正在进行的聊天内容：
${historyText}

现在，${sender}发送了内容: ${message}

请分析聊天内容，考虑：
1. 对话中是否提到了过去发生的事情、人物、事件或信息
2. 是否有需要回忆的内容（比如"之前说过"、"上次"、"以前"等）
3. 是否提到了某个人的习惯、喜好、经历等需要从记忆中获取的信息

如果你认为需要从记忆中检索信息来回答，请直接输出一个最关键的问题（不要加任何前缀）。
如果不需要检索记忆，请输出"无需检索"。`,
        messages: [],
        model: this.config.model,
        temperature: 0.3,
        max_tokens: 150,
      });

      if (result === "无需检索" || result.includes("无需检索")) return null;
      return result.trim() || null;
    } catch (err) {
      logger.warn(`[记忆检索] 问题生成失败: ${err}`);
      return null;
    }
  }

  private async reactSearch(
    sessionId: string,
    question: string,
  ): Promise<string | null> {
    const maxIter = this.config.memory?.maxIterations ?? 3;
    const timeout = this.config.memory?.timeoutMs ?? 15000;
    const startTime = Date.now();

    let collectedInfo = "";
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "search_chat_history",
          description: "搜索历史聊天记录中包含关键词的消息",
          parameters: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "搜索关键词" },
            },
            required: ["keyword"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "search_user_history",
          description: "搜索某个用户的历史发言",
          parameters: {
            type: "object",
            properties: {
              user_id: { type: "number", description: "用户QQ号" },
            },
            required: ["user_id"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "found_answer",
          description: "已找到足够信息，输出最终答案",
          parameters: {
            type: "object",
            properties: {
              answer: { type: "string", description: "找到的答案/信息摘要" },
              found: { type: "boolean", description: "是否找到了有用信息" },
            },
            required: ["answer", "found"],
          },
        },
      },
    ];

    const messages: any[] = [
      {
        role: "system",
        content: `你正在搜集信息来回答问题，帮助你参与聊天。
当前需要解答的问题：${question}
已收集的信息：${collectedInfo || "暂无"}

工具说明：
- search_chat_history: 搜索聊天记录中的关键词
- search_user_history: 查看某个用户的历史发言
- found_answer: 信息足够时结束搜索

先思考当前信息是否足够回答问题，如果不足则使用工具查询，如果足够则使用 found_answer 结束。`,
      },
    ];

    for (let i = 0; i < maxIter; i++) {
      if (Date.now() - startTime > timeout) {
        logger.warn("[记忆检索] 超时退出");
        break;
      }

      try {
        const resp = await this.ai.complete({
          model: this.config.model,
          messages,
          tools,
          temperature: 0.3,
          max_tokens: 500,
        });

        messages.push(resp.raw);

        if (!resp.toolCalls.length) {
          if (resp.content) return resp.content;
          break;
        }

        for (const tc of resp.toolCalls) {
          const args = JSON.parse(tc.arguments || "{}");
          let result = "";

          if (tc.name === "search_chat_history") {
            const msgs = this.db.searchMessages(sessionId, args.keyword, 15);
            if (msgs.length > 0) {
              result = msgs
                .map(
                  (m) =>
                    `[${new Date(m.timestamp).toLocaleString("zh-CN")}] ${m.userName || "unknown"}: ${m.content}`,
                )
                .join("\n");
              collectedInfo += `\n关键词"${args.keyword}"的搜索结果:\n${result}`;
            } else {
              result = `未找到包含"${args.keyword}"的聊天记录`;
            }
          } else if (tc.name === "search_user_history") {
            const msgs = this.db.getMessagesByUser(args.user_id, sessionId, 15);
            if (msgs.length > 0) {
              result = msgs
                .map(
                  (m) =>
                    `[${new Date(m.timestamp).toLocaleString("zh-CN")}] ${m.content}`,
                )
                .join("\n");
              collectedInfo += `\n用户${args.user_id}的发言记录:\n${result}`;
            } else {
              result = `未找到该用户的发言记录`;
            }
          } else if (tc.name === "found_answer") {
            if (args.found) return args.answer;
            return null;
          }

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
      } catch (err) {
        logger.warn(`[记忆检索] ReAct 迭代失败: ${err}`);
        break;
      }
    }

    return collectedInfo || null;
  }
}
