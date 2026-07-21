import OpenAI from "openai";
import { extractUsageTokens } from "../usage/tracker";
import type {
  AIModelDescriptor,
  ProviderCompleteOptions,
  ProviderCompleteResponse,
  UnifiedMessage,
  UnifiedToolCall,
  UnifiedToolDefinition,
} from "../types";
import {
  BaseProviderClient,
  contentToText,
  markStablePrefixCacheable,
  preferCache,
  toModelDescriptor,
} from "./base";

export class OpenAIResponseProvider extends BaseProviderClient {
  private client: OpenAI;

  constructor(provider: ConstructorParameters<typeof BaseProviderClient>[0]) {
    super(provider);
    this.client = new OpenAI({
      baseURL: provider.apiUrl,
      apiKey: provider.apiKey,
      defaultHeaders: this.headers,
    });
  }

  async listModels(): Promise<AIModelDescriptor[]> {
    try {
      const response = await this.client.models.list();
      const items = Array.isArray((response as any)?.data)
        ? (response as any).data
        : [];
      return items
        .map((item: any) => String(item?.id || "").trim())
        .filter(Boolean)
        .map((modelId: string) => toModelDescriptor(this.provider, modelId));
    } catch {
      return [];
    }
  }

  async complete(
    options: ProviderCompleteOptions,
  ): Promise<ProviderCompleteResponse> {
    const prepared = preferCache(options)
      ? markStablePrefixCacheable(options.messages, options.tools)
      : { messages: options.messages, tools: options.tools };

    const { instructions, input } = toResponseInput(
      prepared.messages,
      options.systemPrompt,
    );
    const tools = toResponseTools(prepared.tools);
    const body: Record<string, unknown> = {
      model: options.model,
      input,
      ...(instructions ? { instructions } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens != null
        ? { max_output_tokens: options.maxTokens }
        : {}),
    };

    if (options.stream) {
      return this.completeStream(options, body);
    }

    const response = await (this.client as any).responses.create(body);
    return parseResponseResult(response, options);
  }

  private async completeStream(
    options: ProviderCompleteOptions,
    body: Record<string, unknown>,
  ): Promise<ProviderCompleteResponse> {
    const stream = await (this.client as any).responses.create({
      ...body,
      stream: true,
    });

    let content = "";
    let reasoning = "";
    let usage = extractUsageTokens(undefined);
    const toolCallsByIndex = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const event of stream as AsyncIterable<any>) {
      const type = String(event?.type || "");
      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        content += event.delta;
        await options.onTextDelta?.(event.delta);
      }
      if (
        type === "response.reasoning_text.delta" &&
        typeof event.delta === "string"
      ) {
        reasoning += event.delta;
      }
      if (type === "response.function_call_arguments.delta") {
        const index =
          typeof event.output_index === "number" ? event.output_index : 0;
        const acc = toolCallsByIndex.get(index) || {
          id: "",
          name: "",
          arguments: "",
        };
        if (typeof event.item_id === "string" && event.item_id) acc.id = event.item_id;
        if (typeof event.name === "string" && event.name) acc.name = event.name;
        if (typeof event.delta === "string") acc.arguments += event.delta;
        toolCallsByIndex.set(index, acc);
      }
      if (type === "response.completed") {
        usage = extractUsageTokens(event.response) || usage;
      }
      if (event?.response) {
        usage = extractUsageTokens(event.response) || usage;
      }
    }

    const toolCalls = Array.from(toolCallsByIndex.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, item]) => ({
        id: item.id || `tool_call_${index}_${Date.now()}`,
        name: item.name,
        arguments: item.arguments || "{}",
      }))
      .filter((item) => item.name);

    return {
      content,
      reasoning: reasoning || null,
      toolCalls,
      usage,
      raw: { content, toolCalls },
    };
  }
}

function toResponseInput(
  messages: UnifiedMessage[],
  systemPrompt?: string,
): { instructions?: string; input: any[] } {
  const systemParts: string[] = [];
  if (systemPrompt?.trim()) systemParts.push(systemPrompt.trim());
  const input: any[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(contentToText(message.content));
      continue;
    }
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId || "",
        output: contentToText(message.content),
      });
      continue;
    }
    if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        for (const toolCall of message.toolCalls) {
          input.push({
            type: "function_call",
            call_id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          });
        }
      }
      const text = contentToText(message.content);
      if (text) {
        input.push({
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }
      continue;
    }

    if (typeof message.content === "string") {
      input.push({
        role: "user",
        content: [{ type: "input_text", text: message.content }],
      });
      continue;
    }

    input.push({
      role: "user",
      content: message.content.map((part) => {
        if (part.type === "text") {
          return { type: "input_text", text: part.text };
        }
        if (part.type === "image") {
          return { type: "input_image", image_url: part.url };
        }
        return { type: "input_file", file_url: part.url };
      }),
    });
  }

  return {
    instructions: systemParts.filter(Boolean).join("\n\n") || undefined,
    input,
  };
}

function toResponseTools(tools?: UnifiedToolDefinition[]): any[] {
  if (!tools?.length) return [];
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function parseResponseResult(
  response: any,
  options: ProviderCompleteOptions,
): ProviderCompleteResponse {
  let content = "";
  let reasoning = "";
  const toolCalls: UnifiedToolCall[] = [];

  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    if (item?.type === "message") {
      const parts = Array.isArray(item.content) ? item.content : [];
      for (const part of parts) {
        if (part?.type === "output_text" && typeof part.text === "string") {
          content += part.text;
        }
        if (part?.type === "refusal" && typeof part.refusal === "string") {
          content += part.refusal;
        }
      }
    }
    if (item?.type === "function_call") {
      toolCalls.push({
        id: String(item.call_id || item.id || ""),
        name: String(item.name || ""),
        arguments:
          typeof item.arguments === "string"
            ? item.arguments
            : JSON.stringify(item.arguments || {}),
      });
    }
    if (item?.type === "reasoning") {
      const parts = Array.isArray(item.summary) ? item.summary : [];
      for (const part of parts) {
        if (typeof part?.text === "string") reasoning += part.text;
      }
    }
  }

  if (!content && typeof response?.output_text === "string") {
    content = response.output_text;
  }

  if (content && options.onTextDelta) {
    void options.onTextDelta(content);
  }

  return {
    content,
    reasoning: reasoning || null,
    toolCalls: toolCalls.filter((item) => item.name),
    usage: extractUsageTokens(response),
    raw: response,
  };
}
