import type { AIInstance } from "../../../src/services/ai";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig } from "../types";

export class TopicTracker {
  private ai: AIInstance;
  private config: ChatConfig;
  private db: ChatDatabase;
  private messageCounters: Map<string, number> = new Map();
  private lastCheckTime: Map<string, number> = new Map();

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.ai = ai;
    this.config = config;
    this.db = db;
  }

  async onMessage(sessionId: string): Promise<void> {
    if (!this.config.topic?.enabled) return;

    const count = (this.messageCounters.get(sessionId) ?? 0) + 1;
    this.messageCounters.set(sessionId, count);

    const threshold = this.config.topic.messageThreshold ?? 50;
    const timeThreshold = this.config.topic.timeThresholdMs ?? 8 * 3600_000;
    const lastCheck = this.lastCheckTime.get(sessionId) ?? 0;
    const now = Date.now();

    const shouldCheck =
      count >= threshold || (now - lastCheck > timeThreshold && count >= 15);

    if (shouldCheck) {
      this.messageCounters.set(sessionId, 0);
      this.lastCheckTime.set(sessionId, now);
      this.analyzeTopics(sessionId).catch((err) =>
        logger.warn(`[TopicTracker] Analysis failed: ${err}`),
      );
    }
  }

  getTopicContext(sessionId: string): string {
    const topics = this.db.getTopics(
      sessionId,
      this.config.topic?.maxTopicsPerSession ?? 5,
    );
    if (topics.length === 0) return "";

    const lines = topics.map((t) => {
      const time = new Date(t.updatedAt).toLocaleString("zh-CN");
      let keywords: string[] = [];
      try {
        keywords = JSON.parse(t.keywords);
      } catch {}
      return `- ${t.title} (${time}) Keywords: ${keywords.join(", ")}\n  ${t.summary}`;
    });

    return `## Recent Topics\n${lines.join("\n")}`;
  }

  private async analyzeTopics(sessionId: string): Promise<void> {
    const messages = this.db.getMessages(sessionId, 80);
    if (messages.length < 10) return;

    const existingTopics = this.db.getTopics(sessionId, 20);
    const historyTopicTitles = existingTopics.map((t) => t.title).join("\n");

    const messagesBlock = messages
      .map((m, i) => `[${i + 1}] ${m.userName || "unknown"}: ${m.content}`)
      .join("\n");

    try {
      const content = await this.ai.generateText({
        prompt: `You are a topic analysis assistant. Analyze the topics in the following chat log.

Existing topic titles:
${historyTopicTitles || "(none)"}

Chat log:
${messagesBlock}

Tasks:
1. Identify ongoing topics in the chat log
2. Determine if any existing topics are continuing in this chat
3. Extract keywords and summarize each topic

Output strictly in JSON format:
{
  "topics": [
    {
      "title": "Topic title (use the chat's language)",
      "keywords": ["keyword1", "keyword2"],
      "summary": "50-200 character summary (use the chat's language)",
      "is_continuation": false
    }
  ]
}`,
        messages: [],
        model: this.config.model,
        temperature: 0.3,
        max_tokens: 1000,
      });

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.topics || !Array.isArray(parsed.topics)) return;

      const now = Date.now();
      for (const topic of parsed.topics) {
        if (!topic.title || !topic.summary) continue;

        const existing = existingTopics.find(
          (t) =>
            t.title === topic.title || this.isSimilar(t.title, topic.title),
        );

        if (existing && existing.id) {
          this.db.updateTopic(existing.id, {
            summary: topic.summary,
            keywords: JSON.stringify(topic.keywords || []),
            messageCount: (existing.messageCount || 0) + messages.length,
            updatedAt: now,
          });
        } else {
          this.db.saveTopic({
            sessionId,
            title: topic.title,
            keywords: JSON.stringify(topic.keywords || []),
            summary: topic.summary,
            messageCount: messages.length,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      logger.info(
        `[TopicTracker] Session ${sessionId}: identified ${parsed.topics.length} topics`,
      );
    } catch (err) {
      logger.warn(`[TopicTracker] Analysis failed: ${err}`);
    }
  }

  private isSimilar(a: string, b: string): boolean {
    const setA = new Set(a);
    const setB = new Set(b);
    let common = 0;
    for (const c of setA) {
      if (setB.has(c)) common++;
    }
    const similarity = (common * 2) / (setA.size + setB.size);
    return similarity > 0.7;
  }
}
