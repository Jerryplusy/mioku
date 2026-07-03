import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AITool, ToolCallRecord, ToolResultFollowup } from "mioku";
import { TOOL_RESULT_FOLLOWUP_KEY } from "mioku";
import { logger } from "mioki";
import type {
  AssistantMessageResult,
  CompleteOptions,
  CompleteResponse,
} from "../types";
import type { UsageTracker } from "../usage/tracker";

export interface AssistantRequestArgs {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  temperature: number;
  max_tokens?: number;
  stream?: boolean;
  onTextDelta?: (delta: string) => void | Promise<void>;
}

export interface ToolLoopDeps {
  requestAssistantMessage(args: AssistantRequestArgs): Promise<AssistantMessageResult>;
  globalSkillNames: string[];
}

export async function runToolLoop(
  deps: ToolLoopDeps,
  options: CompleteOptions,
  model: string,
  tracker: UsageTracker,
): Promise<CompleteResponse> {
  const maxIterations = options.maxIterations ?? 40;
  const allToolCalls: ToolCallRecord[] = [];
  const failedToolCallKeys = new Set<string>();
  const sessionMessages = [...options.messages];
  const turnMessages: ChatCompletionMessageParam[] = [];
  let iterations = 0;
  let content = "";
  let reasoning: string | null = null;
  let raw: ChatCompletionMessageParam = { role: "assistant", content: "" };

  while (iterations < maxIterations) {
    iterations++;
    const currentDefinitions = options.executableToolsProvider
      ? options.executableToolsProvider()
      : (options.executableTools ?? []);
    const toolMap = new Map<string, AITool>();
    const tools: ChatCompletionTool[] = [];
    const followupMessages: ChatCompletionMessageParam[] = [];

    for (const definition of currentDefinitions) {
      toolMap.set(definition.name, definition.tool);
      tools.push({
        type: "function",
        function: {
          name: definition.name,
          description: definition.tool.description,
          parameters: definition.tool.parameters,
        },
      });
    }
    tracker.recordToolDefinitions(tools);

    const assistant = await deps.requestAssistantMessage({
      model,
      messages: sessionMessages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: options.stream,
      onTextDelta: options.onTextDelta,
    });
    tracker.recordAssistant(assistant);
    if (assistant.usage) tracker.recordMeasuredTokens(assistant.usage);

    content = assistant.content;
    reasoning = assistant.reasoning;
    raw = assistant.raw;
    sessionMessages.push(assistant.raw);
    turnMessages.push(assistant.raw);

    if (assistant.toolCalls.length === 0) {
      return {
        content,
        reasoning,
        toolCalls: [],
        raw,
        iterations,
        allToolCalls,
        turnMessages,
      };
    }

    for (const toolCall of assistant.toolCalls) {
      const toolName = toolCall.name;
      const tool = toolMap.get(toolName);
      const args = parseToolArguments(toolCall.arguments);
      const callKey = buildToolCallKey(toolName, args);
      let result: any;

      if (!tool) {
        logger.warn(
          `[ai] Tool ${toolName} not found (raw: "${toolName}"). Executable tools: ${[...toolMap.keys()].join(", ") || "(none)"}. Global skills: ${deps.globalSkillNames.join(", ") || "(none)"}`,
        );
        result = { error: `Tool ${toolName} not found` };
      } else if (failedToolCallKeys.has(callKey)) {
        result = {
          success: false,
          error:
            "Tool call skipped: the same tool call with identical arguments already failed in this turn.",
        };
      } else {
        try {
          result = await tool.handler(args);
        } catch (error) {
          logger.error(`Tool ${toolName} execution failed: ${error}`);
          result = { error: String(error) };
        }
      }

      const normalized = normalizeToolResult(result);
      if (isToolErrorResult(normalized.visibleResult)) {
        failedToolCallKeys.add(callKey);
      }

      allToolCalls.push({
        name: toolName,
        arguments: args,
        result: normalized.visibleResult,
      });
      tracker.recordToolCall(toolName);

      const toolMessage = {
        role: "tool",
        content: JSON.stringify(normalized.visibleResult),
        tool_call_id: toolCall.id,
      } as ChatCompletionMessageParam;
      sessionMessages.push(toolMessage);
      turnMessages.push(toolMessage);
      tracker.recordMessage(toolMessage);
      followupMessages.push(...normalized.followupMessages);
    }

    if (followupMessages.length > 0) {
      sessionMessages.push(...followupMessages);
      turnMessages.push(...followupMessages);
      for (const followupMessage of followupMessages) {
        tracker.recordMessage(followupMessage);
      }
    }
  }

  logger.warn(
    `Reached maximum iterations (${maxIterations}) for complete with executable tools`,
  );
  return {
    content: "达到最大迭代次数限制",
    reasoning,
    toolCalls: [],
    raw,
    iterations,
    allToolCalls,
    turnMessages,
  };
}

export function parseToolArguments(raw: string): any {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function buildToolCallKey(name: string, args: any): string {
  return `${name}:${stableStringify(args ?? {})}`;
}

function stableStringify(value: any): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  );
  return `{${pairs.join(",")}}`;
}

function isToolErrorResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  if (result.error) return true;
  return result.success === false;
}

interface NormalizedToolResult {
  visibleResult: any;
  followupMessages: ChatCompletionMessageParam[];
}

export function normalizeToolResult(result: any): NormalizedToolResult {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { visibleResult: result, followupMessages: [] };
  }

  const followup = (result as Record<string, unknown>)[
    TOOL_RESULT_FOLLOWUP_KEY
  ] as ToolResultFollowup | undefined;
  const hasImages = Array.isArray(followup?.images) && followup!.images!.length > 0;
  const hasVideos = Array.isArray(followup?.videos) && followup!.videos!.length > 0;
  if (!followup || (!hasImages && !hasVideos)) {
    return { visibleResult: result, followupMessages: [] };
  }

  const { [TOOL_RESULT_FOLLOWUP_KEY]: _followup, ...visibleResult } = result;
  const content = [
    {
      type: "text" as const,
      text: followup.text || "Use the attached media to answer the request.",
    },
    ...(followup.images || []).map((image) => ({
      type: "image_url" as const,
      image_url: { url: image.url, detail: image.detail ?? "auto" },
    })),
    ...(followup.videos || []).map((video) => ({
      type: "video_url" as const,
      video_url: { url: video.url, detail: video.detail ?? "auto" },
    })),
  ];

  return {
    visibleResult,
    followupMessages: [
      { role: "user", content } as ChatCompletionMessageParam,
    ],
  };
}
