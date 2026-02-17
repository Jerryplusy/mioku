import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { logger } from "mioki";
import type { ChatDatabase } from "./db";
import type {
  ChatConfig,
  ChatMessage,
  PlannerAction,
  PlannerResult,
} from "./types";

// ==================== 2. 回复风格随机化 ====================

/**
 * 根据配置随机选择回复风格，注入到 system prompt
 */
export function pickReplyStyle(config: ChatConfig): string {
  const { replyStyle } = config;
  if (!replyStyle) return "";

  const base = replyStyle.baseStyle || "";
  const styles = replyStyle.multipleStyles || [];
  const prob = replyStyle.multipleProbability ?? 0;

  if (styles.length > 0 && prob > 0 && Math.random() < prob) {
    return styles[Math.floor(Math.random() * styles.length)];
  }
  return base;
}

/**
 * 根据配置随机选择人格状态
 */
export function pickPersonalityState(config: ChatConfig): string | null {
  const { personality } = config;
  if (!personality) return null;

  const states = personality.states || [];
  const prob = personality.stateProbability ?? 0;

  if (states.length > 0 && prob > 0 && Math.random() < prob) {
    return states[Math.floor(Math.random() * states.length)];
  }
  return null;
}

// ==================== 3. 记忆检索系统 ====================

/**
 * 记忆检索系统 - 使用 ReAct 模式从历史消息中检索相关记忆
 *
 * 两段式流程：
 * 1. 分析当前对话，判断是否需要回忆，生成检索问题
 * 2. 使用 ReAct Agent 迭代搜索历史记录，找到答案
 */
export class MemoryRetrieval {
  private client: OpenAI;
  private config: ChatConfig;
  private db: ChatDatabase;

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.client = client;
    this.config = config;
    this.db = db;
  }

  /**
   * 分析当前消息是否需要记忆检索，如果需要则执行检索并返回记忆上下文
   */
  async retrieve(
    sessionId: string,
    currentMessage: string,
    senderName: string,
    recentHistory: ChatMessage[],
  ): Promise<string | null> {
    if (!this.config.memory?.enabled) return null;

    // 第一步：判断是否需要检索 + 生成问题
    const question = await this.generateQuestion(
      currentMessage,
      senderName,
      recentHistory,
    );
    if (!question) return null;

    logger.info(`[记忆检索] 生成问题: ${question}`);

    // 第二步：ReAct Agent 检索
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
      const resp = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: `现在是${timeStr}。
群里正在进行的聊天内容：
${historyText}

现在，${sender}发送了内容: ${message}

请分析聊天内容，考虑：
1. 对话中是否提到了过去发生的事情、人物、事件或信息
2. 是否有需要回忆的内容（比如"之前说过"、"上次"、"以前"等）
3. 是否提到了某个人的习惯、喜好、经历等需要从记忆中获取的信息

如果你认为需要从记忆中检索信息来回答，请直接输出一个最关键的问题（不要加任何前缀）。
如果不需要检索记忆，请输出"无需检索"。`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      const result = resp.choices[0]?.message?.content?.trim() || "";
      if (result === "无需检索" || result.includes("无需检索")) return null;
      return result;
    } catch (err) {
      logger.warn(`[记忆检索] 问题生成失败: ${err}`);
      return null;
    }
  }

  /**
   * ReAct Agent: 迭代搜索历史记录
   */
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

    const messages: OpenAI.ChatCompletionMessageParam[] = [
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
        const resp = await this.client.chat.completions.create({
          model: this.config.model,
          messages,
          tools,
          temperature: 0.3,
          max_tokens: 500,
        });

        const choice = resp.choices[0];
        if (!choice?.message) break;

        messages.push(choice.message);

        if (!choice.message.tool_calls?.length) {
          // 没有工具调用，可能直接给出了文本答案
          if (choice.message.content) return choice.message.content;
          break;
        }

        for (const tc of choice.message.tool_calls) {
          const args = JSON.parse(tc.function.arguments || "{}");
          let result = "";

          if (tc.function.name === "search_chat_history") {
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
          } else if (tc.function.name === "search_user_history") {
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
          } else if (tc.function.name === "found_answer") {
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

// ==================== 4. 话题跟踪 ====================

/**
 * 话题跟踪器 - 自动识别和跟踪聊天话题
 *
 * 触发条件：
 * - 消息数达到阈值
 * - 距离上次检查超过时间阈值
 */
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

  /**
   * 记录消息并检查是否需要进行话题分析
   */
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
      // 异步执行，不阻塞消息处理
      this.analyzeTopics(sessionId).catch((err) =>
        logger.warn(`[话题跟踪] 分析失败: ${err}`),
      );
    }
  }

  /**
   * 获取当前会话的话题摘要，用于注入 prompt
   */
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

        // 检查是否与已有话题重复（简单标题匹配）
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

      // 限制话题数量
      const maxTopics = this.config.topic?.maxTopicsPerSession ?? 20;
      const allTopics = this.db.getTopics(sessionId, maxTopics + 10);
      if (allTopics.length > maxTopics) {
        // 旧话题自然被 getTopics 的 ORDER BY updated_at DESC LIMIT 排除
        // 这里不需要额外删除
      }

      logger.info(
        `[话题跟踪] 会话 ${sessionId} 分析完成，识别 ${parsed.topics.length} 个话题`,
      );
    } catch (err) {
      logger.warn(`[话题跟踪] 分析失败: ${err}`);
    }
  }

  private isSimilar(a: string, b: string): boolean {
    // 简单的相似度检测：共同字符比例
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

// ==================== 5. Action Planner ====================

/**
 * Action Planner - Uses LLM to decide whether AI should reply, wait, or end the conversation
 *
 * ReAct mode: Analyze chat context → Select action → Return decision
 */
export class ActionPlanner {
  private client: OpenAI;
  private config: ChatConfig;
  private actionHistory: Map<
    string,
    { action: PlannerAction; time: number }[]
  > = new Map();

  constructor(client: OpenAI, config: ChatConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Plan next action
   */
  async plan(
    sessionId: string,
    botName: string,
    recentHistory: ChatMessage[],
    lastTriggerMessage: string,
  ): Promise<PlannerResult> {
    if (!this.config.planner?.enabled) {
      return { action: "reply", reason: "planner disabled" };
    }

    const history = this.actionHistory.get(sessionId) ?? [];
    const actionsBlock = history
      .slice(-5)
      .map(
        (a) => `[${new Date(a.time).toLocaleTimeString()}] ${a.action}`,
      )
      .join("\n");

    const chatBlock = recentHistory
      .slice(-20)
      .map((m) => {
        const time = new Date(m.timestamp);
        const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
        return `[${timeStr}] ${m.userName || (m.role === "assistant" ? botName : "unknown")}: ${m.content}`;
      })
      .join("\n");

    const now = new Date();
    const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    try {
      logger.info(`[ActionPlanner] Planning action for session ${sessionId}, last message: "${lastTriggerMessage.substring(0, 50)}..."`);
      
      const resp = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: `It is ${timeStr}. Your name is ${botName}.

Here is the chat content:
${chatBlock}

Action history:
${actionsBlock || "(none)"}

Message that triggered you: ${lastTriggerMessage}

Available actions:

reply - Respond. You can naturally continue the ongoing conversation or naturally ask a question.

wait - Stay silent for now. Suitable when:
- You've expressed yourself clearly and want to give the other person space
- You feel the other person hasn't finished speaking, or you've just sent several consecutive messages
- You want to stay quiet and focus on "listening" rather than immediately replying

complete - The current chat is temporarily over, the other person left, no more topics. Wait for them to speak again before continuing.

Choose the appropriate action. Output strictly in JSON format:
{"action": "reply|wait|complete", "reason": "reason for choice", "wait_seconds": 0}
Note: wait_seconds is only valid when action=wait, representing suggested wait time in seconds (10-300).`,
          },
        ],
        temperature: 0.5,
        max_tokens: 200,
      });

      const content = resp.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`[ActionPlanner] Failed to parse JSON response: ${content.substring(0, 100)}`);
        return { action: "reply", reason: "parse failed" };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const action: PlannerAction =
        parsed.action === "wait"
          ? "wait"
          : parsed.action === "complete"
            ? "complete"
            : "reply";

      const result: PlannerResult = {
        action,
        reason: parsed.reason || "",
        waitMs:
          action === "wait"
            ? Math.min(
                Math.max((parsed.wait_seconds || 30) * 1000, 10000),
                300000,
              )
            : undefined,
      };

      // Record action
      const actions = this.actionHistory.get(sessionId) ?? [];
      actions.push({ action, time: Date.now() });
      if (actions.length > 20) actions.splice(0, actions.length - 20);
      this.actionHistory.set(sessionId, actions);

      logger.info(`[ActionPlanner] Session ${sessionId}: action=${action}, reason="${result.reason}"${result.waitMs ? `, waitMs=${result.waitMs}` : ''}`);
      return result;
    } catch (err) {
      logger.error(`[ActionPlanner] Error: ${err}`);
      return { action: "reply", reason: "error fallback" };
    }
  }
}

// ==================== 6. Chat Frequency Control ====================

/**
 * 聊天频率控制器 - 控制 AI 的发言时机和频率
 *
 * 模拟真人的活跃度变化：白天活跃、深夜沉默、根据聊天氛围调整
 */
export class FrequencyController {
  private config: ChatConfig;
  private lastSpeakTime: Map<string, number> = new Map();
  private consecutiveNoReply: Map<string, number> = new Map();

  constructor(config: ChatConfig) {
    this.config = config;
  }

  /**
   * 判断当前是否应该发言
   * 返回 true 表示可以发言，false 表示应该保持沉默
   */
  shouldSpeak(sessionId: string): boolean {
    if (!this.config.frequency?.enabled) return true;

    const now = Date.now();
    const lastSpeak = this.lastSpeakTime.get(sessionId) ?? 0;
    const minInterval = this.config.frequency.minIntervalMs ?? 5000;

    // 最小间隔检查
    if (now - lastSpeak < minInterval) {
      return false;
    }

    // 计算发言概率
    let probability = this.config.frequency.speakProbability ?? 0.8;

    // 安静时段调整
    const hour = new Date().getHours();
    const quietStart = this.config.frequency.quietHoursStart ?? 23;
    const quietEnd = this.config.frequency.quietHoursEnd ?? 7;
    const isQuietHour =
      quietStart > quietEnd
        ? hour >= quietStart || hour < quietEnd
        : hour >= quietStart && hour < quietEnd;

    if (isQuietHour) {
      probability *= this.config.frequency.quietProbabilityMultiplier ?? 0.3;
    }

    // 连续不回复后提高概率（避免长时间沉默）
    const noReplyCount = this.consecutiveNoReply.get(sessionId) ?? 0;
    if (noReplyCount >= 3) {
      probability = Math.min(probability + 0.2 * (noReplyCount - 2), 1.0);
    }

    const shouldSpeak = Math.random() < probability;

    if (!shouldSpeak) {
      this.consecutiveNoReply.set(sessionId, noReplyCount + 1);
    }

    return shouldSpeak;
  }

  /**
   * 记录已发言
   */
  recordSpeak(sessionId: string): void {
    this.lastSpeakTime.set(sessionId, Date.now());
    this.consecutiveNoReply.set(sessionId, 0);
  }

  /**
   * 计算发言前的模拟延迟（毫秒）
   * 模拟真人"思考"和"打字"的时间
   */
  getTypingDelay(messageLength: number): number {
    if (!this.config.frequency?.enabled) return 0;

    // 基础延迟 1-3 秒
    const baseDelay = 1000 + Math.random() * 2000;
    // 每个字约 50-100ms 的"打字"时间
    const typingTime = messageLength * (50 + Math.random() * 50);
    // 总延迟不超过最大间隔
    const maxDelay = this.config.frequency.maxIntervalMs ?? 10000;

    return Math.min(baseDelay + typingTime, maxDelay);
  }
}

// ==================== 7. 错别字生成器 ====================

/**
 * 同音字映射表 - 常见的同音字替换
 * 基于拼音相似度，模拟真人打字时的输入法错误
 */
const HOMOPHONE_MAP: Record<string, string[]> = {
  的: ["得", "地"],
  得: ["的", "地"],
  地: ["的", "得"],
  在: ["再"],
  再: ["在"],
  做: ["作"],
  作: ["做"],
  那: ["哪"],
  哪: ["那"],
  他: ["她", "它"],
  她: ["他"],
  以: ["已"],
  已: ["以"],
  像: ["象", "想"],
  想: ["象", "像"],
  带: ["代", "待"],
  代: ["带", "待"],
  待: ["带", "代"],
  座: ["坐"],
  坐: ["座"],
  和: ["合"],
  合: ["和"],
  会: ["回", "汇"],
  回: ["会"],
  到: ["道"],
  道: ["到"],
  是: ["事", "试"],
  事: ["是", "试"],
  看: ["砍"],
  吗: ["嘛", "马"],
  嘛: ["吗", "马"],
  了: ["啦"],
  啦: ["了"],
  呢: ["尼", "泥"],
  吧: ["把", "爸"],
  把: ["吧"],
  就: ["旧"],
  还: ["换"],
  很: ["狠"],
  真: ["针", "珍"],
  知: ["只", "之"],
  只: ["知", "之"],
  之: ["知", "只"],
  说: ["谁"],
  什: ["身"],
  么: ["没"],
  没: ["么"],
  要: ["药", "耀"],
  好: ["号"],
  对: ["队"],
  不: ["步", "部"],
  这: ["着"],
  着: ["这"],
  有: ["又", "右"],
  又: ["有", "右"],
  人: ["仁", "任"],
  大: ["达"],
  上: ["尚", "伤"],
  下: ["吓", "夏"],
  中: ["钟", "终"],
  来: ["赖"],
  去: ["趣"],
  出: ["初", "除"],
  时: ["实", "食"],
  实: ["时", "食"],
  年: ["念"],
  生: ["声", "升"],
  能: ["嫩"],
  过: ["锅"],
  也: ["夜", "业"],
  可: ["课", "克"],
  多: ["夺"],
  后: ["候", "厚"],
  候: ["后"],
  前: ["钱", "浅"],
  钱: ["前"],
  里: ["理", "力"],
  理: ["里"],
  心: ["新", "信", "辛"],
  新: ["心", "信"],
  信: ["心", "新"],
  长: ["常", "场"],
  常: ["长"],
  开: ["凯"],
  关: ["官", "观"],
  问: ["文", "闻"],
  文: ["问", "闻"],
  话: ["画", "化"],
  画: ["话"],
  意: ["义", "议", "忆"],
  义: ["意", "议"],
  感: ["赶", "敢"],
  觉: ["角", "脚"],
  情: ["请", "清", "晴"],
  请: ["情", "清"],
  清: ["情", "请"],
  明: ["名", "命"],
  名: ["明"],
  气: ["器", "起"],
  起: ["气", "器"],
  点: ["店", "电"],
  电: ["点", "店"],
  面: ["免", "棉"],
  手: ["受", "收"],
  头: ["投", "偷"],
  身: ["深", "神"],
  走: ["奏"],
  跑: ["泡", "炮"],
  吃: ["迟", "池"],
  喝: ["河", "何"],
  睡: ["水", "谁"],
  玩: ["完", "晚"],
  完: ["玩", "晚"],
  晚: ["玩", "完"],
  早: ["找", "造"],
  找: ["早"],
  快: ["块", "筷"],
  慢: ["满", "蛮"],
  高: ["搞", "告"],
  低: ["底", "地"],
  远: ["院", "愿"],
  近: ["进", "尽"],
  进: ["近", "尽"],
};

/**
 * 常见的缩写/口语化替换
 */
const CASUAL_REPLACEMENTS: [RegExp, string[]][] = [
  [/不知道/, ["不造", "不晓得"]],
  [/什么/, ["啥", "什莫"]],
  [/为什么/, ["为啥", "咋"]],
  [/怎么/, ["咋", "怎莫"]],
  [/这样/, ["酱", "这样子"]],
  [/那样/, ["那样子"]],
  [/非常/, ["超", "贼"]],
  [/特别/, ["超", "贼"]],
  [/可以/, ["行", "ok", "可"]],
  [/没有/, ["没", "木有"]],
  [/不是/, ["不似"]],
  [/觉得/, ["感觉", "jio得"]],
  [/知道/, ["晓得", "知到"]],
  [/厉害/, ["牛", "nb", "6"]],
];

/**
 * 错别字生成器 - 模拟真人打字错误
 */
export class TypoGenerator {
  private config: ChatConfig;

  constructor(config: ChatConfig) {
    this.config = config;
  }

  /**
   * 对文本应用错别字效果
   */
  apply(text: string): string {
    if (!this.config.typo?.enabled) return text;

    const errorRate = this.config.typo.errorRate ?? 0.03;
    const wordReplaceRate = this.config.typo.wordReplaceRate ?? 0.1;

    let result = text;

    // 1. 口语化替换（整词级别）
    if (Math.random() < wordReplaceRate) {
      for (const [pattern, replacements] of CASUAL_REPLACEMENTS) {
        if (pattern.test(result) && Math.random() < wordReplaceRate) {
          const replacement =
            replacements[Math.floor(Math.random() * replacements.length)];
          result = result.replace(pattern, replacement);
          break; // 每次最多替换一处
        }
      }
    }

    // 2. 同音字替换（单字级别）
    const chars = [...result];
    for (let i = 0; i < chars.length; i++) {
      if (Math.random() < errorRate) {
        const homophones = HOMOPHONE_MAP[chars[i]];
        if (homophones && homophones.length > 0) {
          chars[i] = homophones[Math.floor(Math.random() * homophones.length)];
        }
      }
    }

    return chars.join("");
  }
}

// ==================== 8. 表情包系统 ====================

/**
 * 表情包系统 - 根据聊天情感自动选择和发送表情包
 *
 * 功能：
 * - 扫描表情包目录，用 AI 生成描述和情感标签
 * - 根据回复内容的情感匹配表情包
 * - 记录使用频率
 */
export class EmojiSystem {
  private client: OpenAI;
  private config: ChatConfig;
  private db: ChatDatabase;
  private initialized = false;

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.client = client;
    this.config = config;
    this.db = db;
  }

  /**
   * 初始化：扫描表情包目录并注册
   */
  async init(): Promise<void> {
    if (!this.config.emoji?.enabled) return;
    if (this.initialized) return;

    const emojiDir = this.config.emoji.emojiDir;
    if (!emojiDir || !fs.existsSync(emojiDir)) {
      logger.warn(`[表情包] 目录不存在: ${emojiDir}`);
      return;
    }

    const existingEmojis = this.db.getAllEmojis();
    const existingFiles = new Set(existingEmojis.map((e) => e.fileName));

    const files = fs.readdirSync(emojiDir).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
    });

    const newFiles = files.filter((f) => !existingFiles.has(f));
    if (newFiles.length === 0) {
      this.initialized = true;
      return;
    }

    logger.info(`[表情包] 发现 ${newFiles.length} 个新表情包，开始注册...`);

    // 批量注册（每次最多 10 个，避免过多 API 调用）
    const batch = newFiles.slice(0, 10);
    for (const fileName of batch) {
      try {
        const filePath = path.join(emojiDir, fileName);
        const emotion = await this.analyzeEmotion(filePath);
        this.db.saveEmoji({
          fileName,
          description: emotion.description,
          emotion: emotion.emotion,
          usageCount: 0,
          createdAt: Date.now(),
        });
      } catch (err) {
        logger.warn(`[表情包] 注册失败 ${fileName}: ${err}`);
      }
    }

    this.initialized = true;
    logger.info(`[表情包] 注册完成，共 ${batch.length} 个`);
  }

  /**
   * 根据回复内容选择合适的表情包
   * 返回表情包文件路径，或 null
   */
  async pickEmoji(replyContent: string): Promise<string | null> {
    if (!this.config.emoji?.enabled) return null;
    if (Math.random() > (this.config.emoji.sendProbability ?? 0.2)) return null;

    // 分析回复的情感
    const emotion = await this.detectEmotion(replyContent);
    if (!emotion) return null;

    // 从数据库中查找匹配的表情包
    const emojis = this.db.getEmojiByEmotion(emotion, 5);
    if (emojis.length === 0) {
      // 尝试用 "neutral" 兜底
      const fallback = this.db.getEmojiByEmotion("neutral", 3);
      if (fallback.length === 0) return null;
      const picked = fallback[Math.floor(Math.random() * fallback.length)];
      if (picked.id) this.db.incrementEmojiUsage(picked.id);
      return path.join(this.config.emoji.emojiDir, picked.fileName);
    }

    // 加权随机选择（使用频率低的优先）
    const maxUsage = Math.max(...emojis.map((e) => e.usageCount)) + 1;
    const weights = emojis.map((e) => maxUsage - e.usageCount + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let picked = emojis[0];
    for (let i = 0; i < emojis.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        picked = emojis[i];
        break;
      }
    }

    if (picked.id) this.db.incrementEmojiUsage(picked.id);
    return path.join(this.config.emoji.emojiDir, picked.fileName);
  }

  /**
   * 收集群友发送的表情包（从消息中提取图片并注册）
   */
  async collectFromMessage(imageUrl: string, fileName: string): Promise<void> {
    if (!this.config.emoji?.enabled) return;

    const emojiDir = this.config.emoji.emojiDir;
    if (!emojiDir) return;

    // 确保目录存在
    if (!fs.existsSync(emojiDir)) {
      fs.mkdirSync(emojiDir, { recursive: true });
    }

    const targetPath = path.join(emojiDir, fileName);
    if (fs.existsSync(targetPath)) return;

    try {
      // 下载图片
      const response = await fetch(imageUrl);
      if (!response.ok) return;
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(targetPath, buffer);

      // 分析情感并注册
      const emotion = await this.analyzeEmotion(targetPath);
      this.db.saveEmoji({
        fileName,
        description: emotion.description,
        emotion: emotion.emotion,
        usageCount: 0,
        createdAt: Date.now(),
      });

      logger.info(`[表情包] 收集新表情: ${fileName} (${emotion.emotion})`);
    } catch (err) {
      logger.warn(`[表情包] 收集失败: ${err}`);
    }
  }

  private async analyzeEmotion(
    filePath: string,
  ): Promise<{ description: string; emotion: string }> {
    // 如果模型支持多模态，用图像分析
    if (this.config.isMultimodal) {
      try {
        const imageData = fs.readFileSync(filePath);
        const base64 = imageData.toString("base64");
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        const mimeType =
          ext === "jpg"
            ? "image/jpeg"
            : ext === "gif"
              ? "image/gif"
              : `image/${ext}`;

        const resp = await this.client.chat.completions.create({
          model: this.config.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64}`,
                  },
                },
                {
                  type: "text",
                  text: `这是一个表情包/表情图片。请分析它表达的情感。
严格以 JSON 格式输出：
{"description": "简短描述", "emotion": "情感标签"}
情感标签只能是以下之一：happy, sad, angry, surprised, disgusted, scared, neutral, funny, cute, confused, excited, tired, love`,
                },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 150,
        });

        const content = resp.choices[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        logger.warn(`[表情包] 图像分析失败: ${err}`);
      }
    }

    // 兜底：根据文件名猜测
    const name = path.basename(filePath, path.extname(filePath));
    return { description: name, emotion: "neutral" };
  }

  private async detectEmotion(text: string): Promise<string | null> {
    try {
      const resp = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: `分析以下文本的情感，只输出一个情感标签。
可选标签：happy, sad, angry, surprised, disgusted, scared, neutral, funny, cute, confused, excited, tired, love
只输出标签，不要其他内容。`,
          },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: 20,
      });

      return resp.choices[0]?.message?.content?.trim().toLowerCase() || null;
    } catch {
      return null;
    }
  }
}

// ==================== 9. 表达学习 ====================

/**
 * 表达学习系统 - 从群友的消息中学习说话方式
 *
 * 功能：
 * - 分析群友消息中的表达习惯
 * - 提取情境-风格对
 * - 注入 prompt 让 AI 模仿真人说话方式
 */
export class ExpressionLearner {
  private client: OpenAI;
  private config: ChatConfig;
  private db: ChatDatabase;
  private pendingMessages: Map<string, ChatMessage[]> = new Map();
  private readonly BATCH_SIZE = 30; // 积累多少条消息后触发学习

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.client = client;
    this.config = config;
    this.db = db;
  }

  /**
   * 记录消息，积累到一定数量后触发学习
   */
  async onMessage(sessionId: string, message: ChatMessage): Promise<void> {
    if (!this.config.expression?.enabled) return;
    if (message.role !== "user") return;
    if (!message.content || message.content.length < 4) return;

    const pending = this.pendingMessages.get(sessionId) ?? [];
    pending.push(message);
    this.pendingMessages.set(sessionId, pending);

    if (pending.length >= this.BATCH_SIZE) {
      this.pendingMessages.set(sessionId, []);
      // 异步学习，不阻塞
      this.learn(sessionId, pending).catch((err) =>
        logger.warn(`[表达学习] 学习失败: ${err}`),
      );
    }
  }

  /**
   * 获取已学习的表达习惯，用于注入 prompt
   */
  getExpressionContext(sessionId: string): string {
    const sampleSize = this.config.expression?.sampleSize ?? 8;
    const expressions = this.db.getExpressions(sessionId, sampleSize * 3);
    if (expressions.length === 0) return "";

    // 随机采样
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
    // 按用户分组
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

        // 限制总数
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

// ==================== 统一导出 ====================

/**
 * 真人化引擎 - 统一管理所有真人化机制
 */
export class HumanizeEngine {
  readonly memoryRetrieval: MemoryRetrieval;
  readonly topicTracker: TopicTracker;
  readonly actionPlanner: ActionPlanner;
  readonly frequencyController: FrequencyController;
  readonly typoGenerator: TypoGenerator;
  readonly emojiSystem: EmojiSystem;
  readonly expressionLearner: ExpressionLearner;

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.memoryRetrieval = new MemoryRetrieval(client, config, db);
    this.topicTracker = new TopicTracker(client, config, db);
    this.actionPlanner = new ActionPlanner(client, config);
    this.frequencyController = new FrequencyController(config);
    this.typoGenerator = new TypoGenerator(config);
    this.emojiSystem = new EmojiSystem(client, config, db);
    this.expressionLearner = new ExpressionLearner(client, config, db);
  }

  async init(): Promise<void> {
    await this.emojiSystem.init();
  }
}
