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

Choose the appropriate action. Output strictly in JSON format:
{"action": "reply|wait|complete", "reason": "reason for choice", "wait_seconds": 0}
Note: wait_seconds is only valid when action=wait, representing suggested wait time in seconds (10-300).`,
        messages: [],
        model: this.config.model,
        temperature: 0.5,
        max_tokens: 200,
      });

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
