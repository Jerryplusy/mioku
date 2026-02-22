import OpenAI from "openai";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig, ChatMessage } from "../types";

export class ExpressionLearner {
  private client: OpenAI;
  private config: ChatConfig;
  private db: ChatDatabase;
  private pendingMessages: Map<string, ChatMessage[]> = new Map();
  private readonly BATCH_SIZE = 30;

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.client = client;
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
        logger.warn(`[表达学习] 学习失败: ${err}`),
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
      (expr) => `- 当${expr.situation}时：${expr.style}（例：${expr.example}）`,
    );

    return `## 语言习惯参考
在回复时，你可以参考以下从群友那里学到的语言习惯：
${habits.join("\n")}`;
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

      const userName = userMsgs[0].userName || `用户${userId}`;
      const msgTexts = userMsgs.map((m) => m.content).join("\n");

      try {
        const resp = await this.client.chat.completions.create({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: `分析以下用户"${userName}"的聊天消息，提取其说话风格和表达习惯。

消息内容：
${msgTexts}

请提取 2-4 个有代表性的表达习惯，每个包含：
- situation: 使用场景（如"表示赞同"、"吐槽时"、"开心时"）
- style: 表达风格描述（如"喜欢用'6'表示厉害"、"句尾常加'哈哈'"）
- example: 原始消息中的例子

严格以 JSON 格式输出：
{"expressions": [{"situation": "...", "style": "...", "example": "..."}]}

如果消息太普通没有明显特征，输出 {"expressions": []}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        });

        const content = resp.choices[0]?.message?.content || "";
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
          `[表达学习] 从 ${userName} 学到 ${parsed.expressions.length} 个表达习惯`,
        );
      } catch (err) {
        logger.warn(`[表达学习] 分析失败: ${err}`);
      }
    }
  }
}
