import type { AIInstance } from "../../../src/services/ai";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig, ChatMessage } from "../types";

export class ExpressionLearner {
  private ai: AIInstance;
  private config: ChatConfig;
  private db: ChatDatabase;
  private pendingMessages: Map<string, ChatMessage[]> = new Map();
  private readonly BATCH_SIZE = 30;

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.ai = ai;
    this.config = config;
    this.db = db;
  }

  async onMessage(sessionId: string, message: ChatMessage): Promise<void> {
    if (!this.config.expression?.enabled) return;
    if (message.role !== "user") return;
    if (!message.content || message.content.length < 4) return;

    const pending = this.pendingMessages.get(sessionId) ?? [];
    pending.push(message);
    this.pendingMessages.set(sessionId, pending);

    if (pending.length >= this.BATCH_SIZE) {
      this.pendingMessages.set(sessionId, []);
      this.learn(sessionId, pending).catch((err) =>
        logger.warn(`[ExpressionLearner] Learning failed: ${err}`),
      );
    }
  }

  getExpressionContext(sessionId: string): string {
    const sampleSize = this.config.expression?.sampleSize ?? 8;
    const expressions = this.db.getExpressions(sessionId, sampleSize * 3);
    if (expressions.length === 0) return "";

    const shuffled = expressions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, sampleSize);

    const habits = selected.map(
      (expr) =>
        `- When ${expr.situation}: ${expr.style} (e.g. "${expr.example}")`,
    );

    return `## Expression Habits\nExpression habits learned from chat members. You may reference these in your replies:\n${habits.join("\n")}`;
  }

  private async learn(
    sessionId: string,
    messages: ChatMessage[],
  ): Promise<void> {
    const byUser = new Map<number, ChatMessage[]>();
    for (const msg of messages) {
      if (!msg.userId) continue;
      const list = byUser.get(msg.userId) ?? [];
      list.push(msg);
      byUser.set(msg.userId, list);
    }

    for (const [userId, userMsgs] of byUser) {
      if (userMsgs.length < 3) continue;

      const userName = userMsgs[0].userName || `User${userId}`;
      const msgTexts = userMsgs.map((m) => m.content).join("\n");

      try {
        const content = await this.ai.generateText({
          prompt: `Analyze the following chat messages from user "${userName}" and extract their speaking style and expression habits.

Messages:
${msgTexts}

Extract 2-4 representative expression habits, each containing:
- situation: usage context (e.g. "expressing agreement", "complaining", "happy")
- style: style description (e.g. "likes using '6' to mean 'awesome'", "often ends sentences with 'haha'")
- example: an example from the original messages

IMPORTANT: Output situation, style, and example in the SAME LANGUAGE as the chat messages.

Output strictly in JSON format:
{"expressions": [{"situation": "...", "style": "...", "example": "..."}]}

If the messages are too generic with no distinctive features, output {"expressions": []}`,
          messages: [],
          model: this.config.model,
          temperature: 0.3,
          max_tokens: 500,
        });

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.expressions || !Array.isArray(parsed.expressions)) continue;

        const now = Date.now();
        for (const expr of parsed.expressions) {
          if (!expr.situation || !expr.style || !expr.example) continue;

          this.db.saveExpression({
            sessionId,
            userId,
            userName,
            situation: expr.situation,
            style: expr.style,
            example: expr.example,
            createdAt: now,
          });
        }

        const maxExpr = this.config.expression?.maxExpressions ?? 100;
        const count = this.db.getExpressionCount(sessionId);
        if (count > maxExpr) {
          this.db.deleteOldestExpressions(sessionId, maxExpr);
        }

        logger.info(
          `[ExpressionLearner] Learned ${parsed.expressions.length} habits from ${userName}`,
        );
      } catch (err) {
        logger.warn(`[ExpressionLearner] Analysis failed: ${err}`);
      }
    }
  }
}
