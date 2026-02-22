import type { AIInstance } from "../../../src/services/ai";
import { logger } from "mioki";
import type { ChatConfig, ChatMessage, PlannerAction, PlannerResult } from "../types";

export class ActionPlanner {
  private ai: AIInstance;
  private config: ChatConfig;
  private actionHistory: Map<
    string,
    { action: PlannerAction; time: number }[]
  > = new Map();

  constructor(ai: AIInstance, config: ChatConfig) {
    this.ai = ai;
    this.config = config;
  }

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

      const content = await this.ai.generateText({
        prompt: `It is ${timeStr}. Your name is ${botName}.

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

IMPORTANT: You MUST output ONLY valid JSON, no other text. The JSON must be in this exact format:
{"action": "reply", "reason": "your reason here", "wait_seconds": 0}

OR for wait:
{"action": "wait", "reason": "your reason here", "wait_seconds": 30}

OR for complete:
{"action": "complete", "reason": "your reason here", "wait_seconds": 0}

DO NOT include any explanation, markdown formatting, or additional text. Only output the JSON.`,
        messages: [],
        model: this.config.workingModel || this.config.model,
        temperature: 0.2,
        max_tokens: 500,
      });

      // 如果返回内容为空，使用默认值
      if (!content || !content.trim()) {
        logger.warn(`[ActionPlanner] Empty response from AI, using default reply`);
        return { action: "reply", reason: "empty response" };
      }

      // 调试日志
      logger.info(`[ActionPlanner] Raw response: ${content.substring(0, 200)}`);

      // 尝试提取 JSON 块
      let jsonStr = "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      if (!jsonStr) {
        logger.warn(`[ActionPlanner] Failed to find JSON in response: ${content.substring(0, 100)}`);
        return { action: "reply", reason: "parse failed" };
      }

      // 尝试解析 JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // 尝试修复常见的 JSON 错误
        try {
          // 移除可能存在的尾随逗号
          jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          logger.warn(`[ActionPlanner] Failed to parse JSON: ${jsonStr.substring(0, 100)}`);
          return { action: "reply", reason: "parse failed" };
        }
      }
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
