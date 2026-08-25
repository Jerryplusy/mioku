import type { AssistantMessageResult } from "../types";
import type {
  AIUsageCompletionMeta,
  AIUsageContext,
  AIUsageFinalization,
  AIUsageMeasuredTokens,
  AIUsageStore,
} from "./types";

export interface UsageTrackerOptions {
  model: string;
  stream: boolean;
  context?: AIUsageContext;
  startedAt: number;
  initialMessages: any[];
  initialTools?: any[];
  explicitContextTokens?: number;
  explicitBreakdown?: AIUsageFinalization["breakdown"];
  usageStore: AIUsageStore;
}

export class UsageTracker {
  private messages: AIUsageCompletionMeta["messages"] = [];
  private toolCalls: string[] = [];
  private toolDefinitionTokens = 0;
  private toolUseTokens = 0;
  private measuredTokens: AIUsageMeasuredTokens | undefined;
  private finished = false;

  constructor(private readonly options: UsageTrackerOptions) {
    for (const message of options.initialMessages) this.recordMessage(message);
    if (options.initialTools) {
      this.toolDefinitionTokens += estimateJsonTokens(options.initialTools);
    }
  }

  recordMessage(message: any): void {
    const role = normalizeUsageRole(String(message?.role || "user"));
    const contentTokens = estimateMessageContentTokens(message);
    this.messages.push({ role, contentTokens });
    if (role === "tool") this.toolUseTokens += contentTokens;
  }

  recordAssistant(assistant: AssistantMessageResult): void {
    this.recordMessage(assistant.raw);
    if (assistant.servedBy?.isFallback) {
      this.markFallback(assistant.servedBy.providerId, assistant.servedBy.modelId);
    }
  }

  markFallback(providerId: string, modelId: string): void {
    if (!this.options.context) return;
    this.options.context.fallbackUsed = true;
    if (!this.options.context.fallbackFrom) {
      this.options.context.fallbackFrom = `${providerId}/${modelId}`;
    }
  }

  recordMeasuredTokens(tokens: AIUsageMeasuredTokens): void {
    this.measuredTokens = mergeMeasuredTokens(this.measuredTokens, tokens);
  }

  recordToolDefinitions(tools: any[]): void {
    this.toolDefinitionTokens += estimateJsonTokens(tools);
  }

  recordToolCall(name: string): void {
    this.toolCalls.push(name);
  }

  finish(success: boolean, errorMessage?: string): void {
    if (this.finished) return;
    this.finished = true;

    const { options, messages, toolCalls } = this;
    const explicitContextTokens =
      typeof options.explicitContextTokens === "number" &&
      Number.isFinite(options.explicitContextTokens)
        ? Math.max(0, Math.floor(options.explicitContextTokens))
        : 0;
    const explicitBreakdown = options.explicitBreakdown;

    const systemPromptTokens = sumByRole(messages, "system");
    const outputTokens = sumByRole(messages, "assistant");
    const inputTokens = messages
      .filter((m) => m.role !== "assistant")
      .reduce((sum, m) => sum + m.contentTokens, 0);

    const finalInputTokens = this.measuredTokens?.inputTokens ?? inputTokens;
    const finalOutputTokens = this.measuredTokens?.outputTokens ?? outputTokens;
    const finalSystemPromptTokens =
      normalizeUsageBreakdownValue(explicitBreakdown?.systemPromptTokens) ??
      Math.max(0, systemPromptTokens - explicitContextTokens);
    const finalChatHistoryTokens =
      normalizeUsageBreakdownValue(explicitBreakdown?.chatHistoryTokens) ??
      explicitContextTokens;
    const finalToolDefinitionTokens =
      normalizeUsageBreakdownValue(explicitBreakdown?.toolDefinitionTokens) ??
      this.toolDefinitionTokens;
    const finalToolUseTokens =
      normalizeUsageBreakdownValue(explicitBreakdown?.toolUseTokens) ??
      this.toolUseTokens;
    const otherContextTokens =
      normalizeUsageBreakdownValue(explicitBreakdown?.otherContextTokens) ??
      Math.max(
        0,
        finalInputTokens -
          finalSystemPromptTokens -
          finalChatHistoryTokens -
          finalToolDefinitionTokens -
          finalToolUseTokens,
      );
    const adjustedMessages =
      explicitContextTokens > 0
        ? splitExplicitContextTokens(messages, explicitContextTokens)
        : messages;

    options.usageStore.record({
      model: options.model,
      stream: options.stream,
      success,
      errorMessage,
      startedAt: options.startedAt,
      endedAt: Date.now(),
      messages: adjustedMessages,
      inputTokens: finalInputTokens,
      outputTokens: finalOutputTokens,
      cacheWriteTokens: this.measuredTokens?.cacheWriteTokens ?? 0,
      cacheReadTokens: this.measuredTokens?.cacheReadTokens ?? 0,
      sentUserMessages: 0,
      sentAssistantMessages: 0,
      systemPromptTokens: finalSystemPromptTokens,
      toolDefinitionTokens: finalToolDefinitionTokens,
      toolUseTokens: finalToolUseTokens,
      chatHistoryTokens: finalChatHistoryTokens,
      otherContextTokens,
      toolCalls,
      context: options.context,
    });
  }
}

function sumByRole(
  messages: AIUsageCompletionMeta["messages"],
  role: AIUsageCompletionMeta["messages"][number]["role"],
): number {
  return messages
    .filter((m) => m.role === role)
    .reduce((sum, m) => sum + m.contentTokens, 0);
}

export function mergeMeasuredTokens(
  current: AIUsageMeasuredTokens | undefined,
  next: AIUsageMeasuredTokens,
): AIUsageMeasuredTokens {
  return {
    inputTokens: sumOptional(current?.inputTokens, next.inputTokens),
    outputTokens: sumOptional(current?.outputTokens, next.outputTokens),
    totalTokens: sumOptional(current?.totalTokens, next.totalTokens),
    cacheWriteTokens: sumOptional(
      current?.cacheWriteTokens,
      next.cacheWriteTokens,
    ),
    cacheReadTokens: sumOptional(current?.cacheReadTokens, next.cacheReadTokens),
  };
}

function sumOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null && b == null) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function normalizeUsageBreakdownValue(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function splitExplicitContextTokens(
  messages: AIUsageCompletionMeta["messages"],
  contextTokens: number,
): AIUsageCompletionMeta["messages"] {
  let remaining = contextTokens;
  return messages.map((message) => {
    if (message.role !== "system" || remaining <= 0) return message;
    const moved = Math.min(message.contentTokens, remaining);
    remaining -= moved;
    return { ...message, contentTokens: Math.max(0, message.contentTokens - moved) };
  });
}

export function extractUsageTokens(payload: unknown): AIUsageMeasuredTokens | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const usageRecord = usage as Record<string, unknown>;
  const promptDetails = firstObject(
    usageRecord.prompt_tokens_details,
    usageRecord.promptTokensDetails,
    usageRecord.input_tokens_details,
    usageRecord.inputTokensDetails,
  );

  return {
    inputTokens: firstNumber(
      usageRecord.prompt_tokens,
      usageRecord.promptTokens,
      usageRecord.input_tokens,
      usageRecord.inputTokens,
    ),
    outputTokens: firstNumber(
      usageRecord.completion_tokens,
      usageRecord.completionTokens,
      usageRecord.output_tokens,
      usageRecord.outputTokens,
    ),
    totalTokens: firstNumber(
      usageRecord.total_tokens,
      usageRecord.totalTokens,
      usageRecord.total,
    ),
    cacheWriteTokens: firstNumber(
      promptDetails?.cache_creation_input_tokens,
      promptDetails?.cacheCreationInputTokens,
      promptDetails?.cache_write_input_tokens,
      promptDetails?.cacheWriteInputTokens,
      usageRecord.cache_creation_input_tokens,
      usageRecord.cacheCreationInputTokens,
      usageRecord.cache_write_input_tokens,
      usageRecord.cacheWriteInputTokens,
    ),
    cacheReadTokens: firstNumber(
      promptDetails?.cached_tokens,
      promptDetails?.cachedTokens,
      promptDetails?.cache_read_input_tokens,
      promptDetails?.cacheReadInputTokens,
      usageRecord.cache_read_input_tokens,
      usageRecord.cacheReadInputTokens,
      usageRecord.cached_tokens,
      usageRecord.cachedTokens,
    ),
  };
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numberValue) && numberValue >= 0) return Math.floor(numberValue);
  }
  return undefined;
}

function normalizeUsageRole(role: string): "system" | "user" | "assistant" | "tool" {
  if (role === "system" || role === "user" || role === "assistant" || role === "tool") {
    return role;
  }
  return "user";
}

function estimateMessageContentTokens(message: any): number {
  return estimateContentTokens(message?.content);
}

function estimateContentTokens(content: unknown): number {
  if (typeof content === "string") return estimateTextTokens(content);
  if (!Array.isArray(content)) return 0;

  return content.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    const record = item as Record<string, unknown>;
    if (typeof record.text === "string") return sum + estimateTextTokens(record.text);
    if (record.type === "image_url") return sum + 85;
    return sum + estimateJsonTokens(record);
  }, 0);
}

function estimateJsonTokens(value: unknown): number {
  try {
    return estimateTextTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function estimateTextTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  const cjkChars = normalized.match(/[㐀-鿿぀-ヿ]/g)?.length || 0;
  const latinWords = normalized.match(/[A-Za-z0-9_]+/g)?.length || 0;
  const symbols = Math.max(0, normalized.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 0.6 + latinWords * 1.3 + symbols / 6));
}
