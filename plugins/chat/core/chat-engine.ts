import type { AIInstance, MultimodalMessage } from "../../../src/services/ai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { logger } from "mioki";
import type { AITool } from "../../../src";
import type {
  ToolContext,
  ChatMessage,
  TargetMessage,
  ChatResult,
} from "../types";
import type { SessionManager } from "../manage/session";
import type { HumanizeEngine } from "../humanize";
import type { PromptContext } from "./prompt";
import type { SkillSessionManager } from "./tools";
import { createTools } from "./tools";
import { buildSystemPrompt } from "./prompt";

/**
 * Run a single chat turn — AI responds directly via text, tools are side effects
 */
export async function runChat(
  ai: AIInstance,
  toolCtx: ToolContext,
  history: ChatMessage[],
  targetMessage: TargetMessage,
  promptCtx: Omit<
    PromptContext,
    "toolResults" | "activeSkillsInfo" | "chatHistory" | "targetMessage"
  >,
  sessionManager: SessionManager,
  humanize: HumanizeEngine,
  skillManager: SkillSessionManager,
): Promise<ChatResult> {
  const { tools: chatTools } = createTools(toolCtx, skillManager);

  const allToolCalls: { name: string; args: any; result: any }[] = [];
  let toolResults: { toolName: string; result: any }[] = [];
  let lastTextContent = "";

  logger.info(
    `[chat-engine] Session ${toolCtx.sessionId} | target: ${targetMessage.userName}(${targetMessage.userId}): "${targetMessage.content}"`,
  );

  // 获取迭代次数限制
  const maxIterations = toolCtx.config.maxIterations ?? 20;

  for (
    let iteration = 0;
    maxIterations === -1 || iteration < maxIterations;
    iteration++
  ) {
    // Build prompt fresh each iteration
    const activeSkillsInfo = skillManager.getActiveSkillsInfo(
      toolCtx.sessionId,
    );
    const prompt = buildSystemPrompt({
      ...promptCtx,
      toolResults: iteration > 0 ? toolResults : undefined,
      activeSkillsInfo: activeSkillsInfo || undefined,
      chatHistory: history,
      targetMessage,
    });

    logger.info(`[chat-engine] === Prompt (iter ${iteration}) ===`);
    logger.info(prompt);
    logger.info(`[chat-engine] === End Prompt ===`);

    // Build tool definitions
    const skillTools = skillManager.getTools(toolCtx.sessionId);
    const openaiTools = buildOpenAITools(chatTools, skillTools);

    // 构建消息
    const pendingImages = toolCtx.pendingImageUrls;
    const isMultimodal = toolCtx.config.isMultimodal;
    const hasImages = pendingImages && pendingImages.length > 0;

    // 多模态模型需要使用数组格式，文本模型使用字符串格式
    let messages: any[];

    if (isMultimodal || hasImages) {
      // system 消息只包含提示词
      messages = [{ role: "system", content: prompt }];

      // user 消息包含用户内容和图片
      if (hasImages) {
        const userContent: any[] = [
          { type: "text", text: targetMessage.content },
        ];
        for (const url of pendingImages) {
          userContent.push({ type: "image_url", image_url: { url } });
        }
        messages.push({ role: "user", content: userContent });

        logger.info(
          `[chat-engine] Attaching ${pendingImages.length} image(s) to user message`,
        );
        // 清除待附加的图片
        toolCtx.pendingImageUrls = [];
      } else {
        messages.push({ role: "user", content: targetMessage.content });
      }
    } else {
      messages = [{ role: "system", content: prompt }];
    }

    // Call AI
    const resp = await ai.complete({
      model: toolCtx.config.model,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      temperature: toolCtx.config.temperature,
    });

    // Log AI reasoning if present
    if (resp.reasoning) {
      logger.info(
        `[chat-engine] AI reasoning (iter ${iteration}): ${resp.reasoning}`,
      );
    }

    // Capture text content
    if (resp.content) {
      lastTextContent = resp.content;
      logger.info(
        `[chat-engine] AI reply (iter ${iteration}): "${resp.content}"`,
      );

      // 如果有回调函数，立即发送文本内容
      if (toolCtx.onTextContent && lastTextContent.trim()) {
        const messages = cleanMarkers(lastTextContent);
        if (messages.length > 0) {
          // 记录已发送的消息索引
          if (!toolCtx.sentMessageIndices) {
            toolCtx.sentMessageIndices = new Set();
          }
          toolCtx.sentMessageIndices.add(0);

          // 异步调用回调，不阻塞工具执行
          const callbackResult = toolCtx.onTextContent(
            lastTextContent,
            0,
            messages.length,
          );
          if (callbackResult && typeof callbackResult.then === "function") {
            callbackResult.catch((err: any) =>
              logger.warn(
                `[chat-engine] onTextContent callback failed: ${err}`,
              ),
            );
          }
        }
      }
    }

    // No tool calls → done
    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      break;
    }

    // Process tool calls in parallel (不阻塞文本发送)
    const toolPromises: Promise<void>[] = [];
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

      // end_session 工具：立即结束会话
      if (tc.name === "end_session") {
        const result = await handler.tool.handler(args, toolCtx.event);
        logger.info(
          `[chat-engine] Session ended: ${args.reason || "no reason"}`,
        );
        // 不发送任何消息，直接结束
        return {
          messages: [],
          pendingAt: [],
          pendingPoke: [],
          pendingQuote: undefined,
          toolCalls: allToolCalls,
          emojiPath: null,
        };
      }

      // Execute handler asynchronously
      logger.info(
        `[chat-engine] Tool call: ${tc.name}(${JSON.stringify(args).substring(0, 100)})`,
      );

      const toolPromise = (async () => {
        try {
          const result = await handler.tool.handler(args, toolCtx.event);
          allToolCalls.push({ name: tc.name, args, result });

          if (handler.tool.returnToAI) {
            newToolResults.push({ toolName: tc.name, result });
            hasReturnToAI = true;
          }
        } catch (err) {
          logger.warn(`[chat-engine] Tool ${tc.name} failed: ${err}`);
          const errorResult = { error: String(err) };
          allToolCalls.push({ name: tc.name, args, result: errorResult });

          if (handler.tool.returnToAI) {
            newToolResults.push({ toolName: tc.name, result: errorResult });
            hasReturnToAI = true;
          }
        }
      })();

      toolPromises.push(toolPromise);
    }

    // Wait for all tools to complete (but text was already sent via callback)
    await Promise.all(toolPromises);

    // Update tool results for next iteration
    toolResults = newToolResults;

    // If no returnToAI tools were called, we're done
    if (!hasReturnToAI) {
      break;
    }
  }

  // Clean markers from text for storage/emoji pick
  const cleanedText = cleanMarkers(lastTextContent);

  // Parse messages (markers will be processed when sending)
  const messages = parseMessages(cleanedText);

  // Save assistant message to DB
  if (cleanedText.trim()) {
    toolCtx.db.saveMessage({
      sessionId: toolCtx.sessionId,
      role: "assistant",
      content: cleanedText,
      timestamp: Date.now(),
    });
  }

  // Pick emoji
  let emojiPath: string | null = null;
  if (cleanedText.trim()) {
    emojiPath = await humanize.emojiSystem.pickEmoji(cleanedText);
  }

  logger.info(
    `[chat-engine] Session ${toolCtx.sessionId} done | ${messages.length} msg(s), ${allToolCalls.length} tool call(s)`,
  );

  return {
    messages,
    pendingAt: [],
    pendingPoke: [],
    pendingQuote: undefined,
    toolCalls: allToolCalls,
    emojiPath,
  };
}

/**
 * Remove action markers from text for storage/display
 * Note: ALL markers are preserved here - they'll be parsed by parseLineMarkers in index.ts
 */
function cleanMarkers(text: string): string {
  // Don't remove any markers here - let parseLineMarkers handle them
  // This ensures AT, poke, and reply markers are available for message construction
  return text.trim();
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
