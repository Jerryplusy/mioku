import type {
  AIInstance,
  SessionToolDefinition,
} from "../../../src/services/ai";
import { logger } from "mioki";
import type { AITool } from "../../../src";
import type {
  ToolContext,
  ChatMessage,
  TargetMessage,
  ChatResult,
} from "../types";
import type { HumanizeEngine } from "../humanize";
import type { PromptContext } from "./prompt";
import type { SkillSessionManager } from "./tools";
import { createTools } from "./tools";
import { buildSystemPrompt } from "./prompt";

/**
 * Run a single chat turn using standard assistant/tool messages retained by AI service.
 */
export async function runChat(
  ai: AIInstance,
  toolCtx: ToolContext,
  history: ChatMessage[],
  targetMessage: TargetMessage,
  promptCtx: Omit<
    PromptContext,
    "activeSkillsInfo" | "chatHistory" | "targetMessage"
  >,
  humanize: HumanizeEngine,
  skillManager: SkillSessionManager,
): Promise<ChatResult> {
  const { tools: chatTools } = createTools(toolCtx, skillManager);
  const skillTools = skillManager.getTools(toolCtx.sessionId);
  const activeSkillsInfo = skillManager.getActiveSkillsInfo(toolCtx.sessionId);
  const prompt = buildSystemPrompt({
    ...promptCtx,
    activeSkillsInfo: activeSkillsInfo || undefined,
    chatHistory: history,
    targetMessage,
    emojiAgent: humanize.emojiAgent,
  });

  logger.info(
    `[chat-engine] Session ${toolCtx.sessionId} | target: ${targetMessage.userName}(${targetMessage.userId}): "${targetMessage.content}"`,
  );
  if (toolCtx.config.debug) {
    logger.info("[chat-engine] === Prompt ===");
    logger.info(prompt);
    logger.info("[chat-engine] === End Prompt ===");
  }

  const streamEnabled = Boolean(toolCtx.config.stream);
  const streamedMessages: string[] = [];
  let streamBuffer = "";

  const emitStreamSegment = async (segment: string): Promise<void> => {
    const text = cleanMarkers(segment)
      .replace(/\[meme:[^\]]+\]/gi, "")
      .replace(/\r/g, "")
      .trim();
    if (!text || text === "---") {
      return;
    }

    const index = streamedMessages.length;
    if (toolCtx.onTextContent) {
      await toolCtx.onTextContent(text, index, index + 1);
      toolCtx.sentMessageIndices ??= new Set<number>();
      toolCtx.sentMessageIndices.add(index);
    }
    streamedMessages.push(text);
  };

  const flushStreamBuffer = async (force: boolean): Promise<void> => {
    while (true) {
      const newlineIndex = streamBuffer.indexOf("\n");
      if (newlineIndex < 0) break;

      const segment = streamBuffer.slice(0, newlineIndex);
      streamBuffer = streamBuffer.slice(newlineIndex + 1);
      await emitStreamSegment(segment);
    }

    if (force && streamBuffer.trim()) {
      const segment = streamBuffer;
      streamBuffer = "";
      await emitStreamSegment(segment);
    }
  };

  const response = await ai.complete({
    sessionId: toolCtx.sessionId,
    model: toolCtx.config.model,
    messages: buildCurrentMessages(
      prompt,
      targetMessage,
      toolCtx.pendingImageUrls,
    ),
    executableTools: buildSessionTools(chatTools, skillTools),
    toolContextTtlMs: toolCtx.config.toolContextTtlMs,
    temperature: toolCtx.config.temperature,
    maxIterations: toolCtx.config.maxIterations,
    stream: streamEnabled,
    onTextDelta: streamEnabled
      ? async (delta) => {
          streamBuffer += delta;
          await flushStreamBuffer(false);
        }
      : undefined,
  });

  if (streamEnabled) {
    await flushStreamBuffer(true);
  }

  if (response.reasoning) {
    logger.info(`[chat-engine] AI reasoning: ${response.reasoning}`);
  }

  const allToolCalls = response.allToolCalls || [];

  if (allToolCalls.length > 0) {
    for (const toolCall of allToolCalls) {
      logger.info(
        `[chat-engine] Tool call: ${toolCall.name}(${JSON.stringify(toolCall.arguments).substring(0, 100)})`,
      );
    }
  }

  if (shouldEndSession(allToolCalls)) {
    ai.clearToolContext(toolCtx.sessionId);
    logger.info(`[chat-engine] Session ${toolCtx.sessionId} ended by tool`);
    return {
      messages: [],
      pendingAt: [],
      pendingPoke: [],
      pendingQuote: undefined,
      toolCalls: allToolCalls.map((toolCall) => ({
        name: toolCall.name,
        args: toolCall.arguments,
        result: toolCall.result,
      })),
      emojiPath: null,
    };
  }

  let cleanedText = cleanMarkers(response.content || "");
  if (!cleanedText) {
    const failedToolCalls = allToolCalls.filter((toolCall) =>
      isToolErrorResult(toolCall.result),
    );
    if (failedToolCalls.length > 0) {
      cleanedText = await generateToolFailureReply(
        ai,
        toolCtx,
        prompt,
        targetMessage,
        failedToolCalls,
      );
    }
  }

  let emojiPath: string | null = null;
  let finalText = cleanedText;
  if (cleanedText.trim()) {
    const memeResult = await humanize.emojiAgent.processMemeResponse(
      cleanedText,
      toolCtx.sessionId,
    );
    if (memeResult.success && memeResult.emojiPath) {
      emojiPath = memeResult.emojiPath;
      finalText = memeResult.cleanedText || cleanedText;
    }
  }

  const finalMessages =
    streamEnabled && streamedMessages.length > 0
      ? streamedMessages
      : parseMessages(finalText);

  logger.info(
    `[chat-engine] Session ${toolCtx.sessionId} done | ${finalMessages.length} msg(s), ${allToolCalls.length} tool call(s)`,
  );

  return {
    messages: finalMessages,
    pendingAt: [],
    pendingPoke: [],
    pendingQuote: undefined,
    toolCalls: allToolCalls.map((toolCall) => ({
      name: toolCall.name,
      args: toolCall.arguments,
      result: toolCall.result,
    })),
    emojiPath,
  };
}

function buildCurrentMessages(
  prompt: string,
  targetMessage: TargetMessage,
  pendingImageUrls?: string[],
): any[] {
  const messages: any[] = [{ role: "system", content: prompt }];
  const hasImages = Boolean(pendingImageUrls && pendingImageUrls.length > 0);

  if (!hasImages) {
    messages.push({
      role: "user",
      content: targetMessage.content,
    });
    return messages;
  }

  const userContent: any[] = [{ type: "text", text: targetMessage.content }];
  for (const url of pendingImageUrls || []) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  messages.push({
    role: "user",
    content: userContent,
  });
  return messages;
}

function buildSessionTools(
  chatTools: AITool[],
  skillTools: Map<string, AITool>,
): SessionToolDefinition[] {
  const tools: SessionToolDefinition[] = [];

  for (const tool of chatTools) {
    tools.push({
      name: tool.name,
      tool,
    });
  }

  for (const [name, tool] of skillTools) {
    tools.push({
      name,
      tool,
    });
  }

  return tools;
}

function shouldEndSession(
  toolCalls: Array<{ name: string; result: any }>,
): boolean {
  return toolCalls.some((toolCall) => {
    if (toolCall.name !== "end_session") {
      return false;
    }

    const result = toolCall.result;
    return Boolean(result && typeof result === "object" && result.ended);
  });
}

/**
 * Remove action markers from text for storage/display.
 * Note: ALL markers are preserved here - they'll be parsed by parseLineMarkers in index.ts
 */
function cleanMarkers(text: string): string {
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

function isToolErrorResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  if (result.error) return true;
  if (result.success === false) return true;
  return false;
}

async function generateToolFailureReply(
  ai: AIInstance,
  toolCtx: ToolContext,
  chatSystemPrompt: string,
  targetMessage: TargetMessage,
  failedToolCalls: Array<{ name: string; result: any }>,
): Promise<string> {
  const failedToolNames = [...new Set(failedToolCalls.map((t) => t.name))];
  const failedSummary = failedToolCalls
    .map((item) => {
      const raw =
        typeof item.result === "string"
          ? item.result
          : JSON.stringify(item.result);
      return `- ${item.name}: ${raw}`;
    })
    .join("\n");
  const userPrompt = `用户原始消息：${targetMessage.content}

补充上下文：你刚才尝试调用工具，但以下工具失败了：
${failedSummary}

请基于当前会话的人设与语气，给用户一条自然、简短的回复。
要求：
- 可以简要提到“刚刚没查到/调用失败”，但不要泄露内部系统细节。
- 给出可执行的下一步建议（如补充关键词、提供更具体链接、稍后再试）。
- 直接输出最终回复文本，不要解释你在做什么。`;

  try {
    const retry = await ai.complete({
      model: toolCtx.config.model,
      messages: [
        { role: "system", content: chatSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: Math.max(0.2, Math.min(0.8, toolCtx.config.temperature)),
      max_tokens: 120,
    });

    const text = cleanMarkers(retry.content || "");
    if (text) {
      return text;
    }
  } catch (err) {
    logger.warn(`[chat-engine] Failed to generate tool-failure fallback reply: ${err}`);
  }

  return "我刚刚查这条信息时出了点问题，你可以换个关键词再试试，或者给我更具体一点的线索。";
}
