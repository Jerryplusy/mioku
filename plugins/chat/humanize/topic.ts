import OpenAI from "openai";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig } from "../types";

export class TopicTracker {
  private client: OpenAI;
  private config: ChatConfig;
  private db: ChatDatabase;
  private messageCounters: Map<string, number> = new Map();
  private lastCheckTime: Map<string, number> = new Map();

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.client = client;
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
        logger.warn(`[话题跟踪] 分析失败: ${err}`),
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
      } catch { }
      return `- ${t.title}（${time}）关键词: ${keywords.join(", ")}\n  ${t.summary}`;
    });

    return `## 最近话题\n${lines.join("\n")}`;
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
      const resp = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: `你是一个话题分析助手。请分析聊天记录中的话题。

历史话题标题列表：
${historyTopicTitles || "（暂无）"}

本次聊天记录：
${messagesBlock}

请完成以下任务：
1. 识别聊天记录中正在进行的话题
2. 判断是否有历史话题在本次聊天中延续
3. 对每个话题提取关键词和概括

请严格以 JSON 格式输出：
{
  "topics": [
    {
      "title": "话题标题",
      "keywords": ["关键词1", "关键词2"],
      "summary": "50-200字的概括",
      "is_continuation": false
    }
  ]
}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = resp.choices[0]?.message?.content || "";
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

      const maxTopics = this.config.topic?.maxTopicsPerSession ?? 20;
      const allTopics = this.db.getTopics(sessionId, maxTopics + 10);
      if (allTopics.length > maxTopics) {
        // 旧话题自然被 getTopics 的 ORDER BY updated_at DESC LIMIT 排除
      }

      logger.info(
        `[话题跟踪] 会话 ${sessionId} 分析完成，识别 ${parsed.topics.length} 个话题`,
      );
    } catch (err) {
      logger.warn(`[话题跟踪] 分析失败: ${err}`);
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
