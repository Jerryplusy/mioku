import type { AIInstance } from "../../src/services/ai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { logger } from "mioki";
import type { AITool } from "../../src";
import type { ChatConfig, ToolContext, ChatMessage, TargetMessage, ChatResult } from "./types";
import type { SessionManager } from "./session";
import type { HumanizeEngine } from "./humanize";
import type { PromptContext } from "./prompt";
import type { SkillSessionManager } from "./tools";
import { createTools } from "./tools";
import { buildSystemPrompt } from "./prompt";

const MAX_ITERATIONS = 5;

/**
 * Run a single chat turn — AI responds directly via text, tools are side-effects
 */
export async function runChat(
  ai: AIInstance,
  toolCtx: ToolContext,
  history: ChatMessage[],
  targetMessage: TargetMessage,
  promptCtx: Omit<PromptContext, "toolResults" | "activeSkillsInfo" | "chatHistory" | "targetMessage">,
  sessionManager: SessionManager,
  humanize: HumanizeEngine,
  skillManager: SkillSessionManager,
): Promise<ChatResult> {
  const { tools: chatTools } = createTools(toolCtx, skillManager);

  const pendingAt: number[] = [];
  let pendingQuote: number | undefined;
  const allToolCalls: { name: string; args: any; result: any }[] = [];
  let toolResults: { toolName: string; result: any }[] = [];
  let lastTextContent = "";

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Build prompt fresh each iteration
    const activeSkillsInfo = skillManager.getActiveSkillsInfo(toolCtx.sessionId);
    const prompt = buildSystemPrompt({
      ...promptCtx,
      toolResults: iteration > 0 ? toolResults : undefined,
      activeSkillsInfo: activeSkillsInfo || undefined,
      chatHistory: history,
      targetMessage,
    });

    // Build tool definitions
    const skillTools = skillManager.getTools(toolCtx.sessionId);
    const openaiTools = buildOpenAITools(chatTools, skillTools);

    // Call AI
    const resp = await ai.complete({
      model: toolCtx.config.model,
      messages: [{ role: "system", content: prompt }],
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      temperature: toolCtx.config.temperature,
    });

    // Capture text content
    if (resp.content) {
      lastTextContent = resp.content;
    }

    // No tool calls → done
    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      break;
    }

    // Process tool calls
    const newToolResults: { toolName: string; result: any }[] = [];
    let hasReturnToAI = false;

    for (const tc of resp.toolCalls) {
      let args: any;
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch {
        args = {};
      }

      // Find handler
      const handler = findToolHandler(tc.name, chatTools, skillTools);
      if (!handler) {
        logger.warn(`[chat-engine] Unknown tool: ${tc.name}`);
        continue;
      }

      // Special handling for at_user and quote_reply
      if (tc.name === "at_user") {
        if (args.user_id) pendingAt.push(args.user_id);
        allToolCalls.push({ name: tc.name, args, result: { success: true } });
        continue;
      }

      if (tc.name === "quote_reply") {
        if (args.message_id) pendingQuote = args.message_id;
        allToolCalls.push({ name: tc.name, args, result: { success: true } });
        continue;
      }

      // Execute handler
      try {
        const result = await handler.tool.handler(args);
        allToolCalls.push({ name: tc.name, args, result });

        if (handler.tool.returnToAI) {
          newToolResults.push({ toolName: tc.name, result });
          hasReturnToAI = true;
        }

        // If load_skill was called, skill tools changed — will be picked up next iteration
      } catch (err) {
        logger.warn(`[chat-engine] Tool ${tc.name} failed: ${err}`);
        const errorResult = { error: String(err) };
        allToolCalls.push({ name: tc.name, args, result: errorResult });

        if (handler.tool.returnToAI) {
          newToolResults.push({ toolName: tc.name, result: errorResult });
          hasReturnToAI = true;
        }
      }
    }

    // Update tool results for next iteration
    toolResults = newToolResults;

    // If no returnToAI tools were called, we're done
    if (!hasReturnToAI) {
      break;
    }
  }

  // Parse messages from text
  const messages = parseMessages(lastTextContent);

  // Save assistant message to DB
  if (lastTextContent.trim()) {
    toolCtx.db.saveMessage({
      sessionId: toolCtx.sessionId,
      role: "assistant",
      content: lastTextContent,
      timestamp: Date.now(),
    });
  }

  // Pick emoji
  let emojiPath: string | null = null;
  if (lastTextContent.trim()) {
    emojiPath = await humanize.emojiSystem.pickEmoji(lastTextContent);
  }

  return {
    messages,
    pendingAt,
    pendingQuote,
    toolCalls: allToolCalls,
    emojiPath,
  };
}

/**
 * Parse AI text response into separate messages split by ---
 */
function parseMessages(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Find a tool handler by name from chat tools or skill tools
 */
function findToolHandler(
  name: string,
  chatTools: AITool[],
  skillTools: Map<string, AITool>,
): { tool: AITool } | undefined {
  const chatTool = chatTools.find((t) => t.name === name);
  if (chatTool) return { tool: chatTool };

  const skillTool = skillTools.get(name);
  if (skillTool) return { tool: skillTool };

  return undefined;
}

/**
 * Build OpenAI-format tool definitions
 */
function buildOpenAITools(
  chatTools: AITool[],
  skillTools: Map<string, AITool>,
): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [];

  for (const tool of chatTools) {
    tools.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }

  for (const [name, tool] of skillTools) {
    tools.push({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }

  return tools;
}
