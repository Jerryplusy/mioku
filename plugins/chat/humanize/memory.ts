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

    logger.info(`[MemoryRetrieval] Generated question: ${question}`);

    const answer = await this.reactSearch(sessionId, question);
    if (!answer) return null;

    logger.info(
      `[MemoryRetrieval] Found answer: ${answer.substring(0, 100)}...`,
    );
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
    const timeStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    try {
      const result = await this.ai.generateText({
        prompt: `Current time: ${timeStr}.
Ongoing chat:
${historyText}

Now, ${sender} sent: ${message}

Analyze the chat and consider:
1. Does the conversation reference past events, people, or information?
2. Are there cues suggesting memory retrieval is needed (e.g. "you said before", "last time", "remember when")?
3. Does it mention someone's habits, preferences, or experiences that need to be recalled?

If you think memory retrieval is needed to respond properly, output a single key question (no prefix).
If no retrieval is needed, output exactly: NO_RETRIEVAL_NEEDED`,
        messages: [],
        model: this.config.model,
        temperature: 0.3,
        max_tokens: 150,
      });

      if (result.includes("NO_RETRIEVAL_NEEDED")) return null;
      return result.trim() || null;
    } catch (err) {
      logger.warn(`[MemoryRetrieval] Question generation failed: ${err}`);
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
          description:
            "Search chat history for messages containing a keyword",
          parameters: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "Search keyword" },
            },
            required: ["keyword"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "search_user_history",
          description: "Search a specific user's message history",
          parameters: {
            type: "object",
            properties: {
              user_id: { type: "number", description: "User QQ number" },
            },
            required: ["user_id"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "found_answer",
          description:
            "Enough information has been found. Output the final answer.",
          parameters: {
            type: "object",
            properties: {
              answer: {
                type: "string",
                description: "The found answer/information summary",
              },
              found: {
                type: "boolean",
                description: "Whether useful information was found",
              },
            },
            required: ["answer", "found"],
          },
        },
      },
    ];

    const messages: any[] = [
      {
        role: "system",
        content: `You are searching for information to answer a question and help participate in a chat.
Question to answer: ${question}
Collected info so far: ${collectedInfo || "none"}

Tools:
- search_chat_history: Search chat history by keyword
- search_user_history: View a user's message history
- found_answer: End search when you have enough info

Think about whether current info is sufficient. If not, use tools to search. If sufficient, use found_answer to finish.`,
      },
    ];

    for (let i = 0; i < maxIter; i++) {
      if (Date.now() - startTime > timeout) {
        logger.warn("[MemoryRetrieval] Timeout");
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
              collectedInfo += `\nSearch results for "${args.keyword}":\n${result}`;
            } else {
              result = `No messages found containing "${args.keyword}"`;
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
              collectedInfo += `\nUser ${args.user_id} messages:\n${result}`;
            } else {
              result = `No messages found for this user`;
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
        logger.warn(`[MemoryRetrieval] ReAct iteration failed: ${err}`);
        break;
      }
    }

    return collectedInfo || null;
  }
}
