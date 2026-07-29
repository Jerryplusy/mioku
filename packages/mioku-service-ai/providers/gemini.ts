import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type FunctionDeclaration,
  type GenerativeModel,
  type Part,
} from "@google/generative-ai";
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
  extractSystemText,
  markStablePrefixCacheable,
  preferCache,
  toModelDescriptor,
} from "./base";

const GEMINI_BUILTIN_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

export class GeminiProvider extends BaseProviderClient {
  private client: GoogleGenerativeAI;

  constructor(provider: ConstructorParameters<typeof BaseProviderClient>[0]) {
    super(provider);
    this.client = new GoogleGenerativeAI(provider.apiKey);
  }

  async listModels(): Promise<AIModelDescriptor[]> {
    try {
      const base = (this.provider.apiUrl || "").replace(/\/$/, "");
      const url = `${base || "https://generativelanguage.googleapis.com"}/v1beta/models?key=${encodeURIComponent(this.provider.apiKey)}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const data = (await res.json()) as any;
      const models = Array.isArray(data?.models) ? data.models : [];
      return models
        .map((item: any) => String(item?.name || "").replace(/^models\//, ""))
        .filter(Boolean)
        .map((modelId: string) => toModelDescriptor(this.provider, modelId));
    } catch {
      return GEMINI_BUILTIN_MODELS.map((modelId) =>
        toModelDescriptor(this.provider, modelId),
      );
    }
  }

  async complete(
    options: ProviderCompleteOptions,
  ): Promise<ProviderCompleteResponse> {
    const prepared = preferCache(options)
      ? markStablePrefixCacheable(options.messages, options.tools)
      : { messages: options.messages, tools: options.tools };

    const { system, rest } = extractSystemText(prepared.messages);
    const systemInstruction = [options.systemPrompt, system]
      .filter(Boolean)
      .join("\n\n");
    const model = this.client.getGenerativeModel({
      model: options.model,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(prepared.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: toGeminiTools(prepared.tools),
              },
            ],
          }
        : {}),
    });

    const contents = await toGeminiContents(rest);
    if (options.stream) {
      return this.completeStream(options, model, contents);
    }

    const result = await model.generateContent({
      contents,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });
    return parseGeminiResult(result.response, options);
  }

  private async completeStream(
    options: ProviderCompleteOptions,
    model: GenerativeModel,
    contents: Content[],
  ): Promise<ProviderCompleteResponse> {
    const stream = await model.generateContentStream({
      contents,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });

    let content = "";
    let reasoning = "";
    const toolCalls: UnifiedToolCall[] = [];
    let usage = extractUsageTokens(undefined);

    for await (const chunk of stream.stream) {
      const text = chunk.text?.() || "";
      if (text) {
        content += text;
        await options.onTextDelta?.(text);
      }
      const candidates = chunk.candidates || [];
      for (const candidate of candidates) {
        for (const part of candidate.content?.parts || []) {
          if ((part as any).thought && typeof (part as any).text === "string") {
            reasoning += (part as any).text;
          }
          if ((part as any).functionCall) {
            const call = (part as any).functionCall;
            toolCalls.push({
              id: `gemini_tool_${toolCalls.length}_${Date.now()}`,
              name: String(call.name || ""),
              arguments: JSON.stringify(call.args ?? {}),
            });
          }
        }
      }
      usage =
        extractUsageTokens({
          usage: {
            prompt_tokens: (chunk as any)?.usageMetadata?.promptTokenCount,
            completion_tokens: (chunk as any)?.usageMetadata
              ?.candidatesTokenCount,
            total_tokens: (chunk as any)?.usageMetadata?.totalTokenCount,
            cached_tokens: (chunk as any)?.usageMetadata?.cachedContentTokenCount,
          },
        }) || usage;
    }

    const final = await stream.response;
    const parsed = parseGeminiResult(final, options);
    if (!parsed.content && content) parsed.content = content;
    if (!parsed.reasoning && reasoning) parsed.reasoning = reasoning;
    if (parsed.toolCalls.length === 0 && toolCalls.length > 0) {
      parsed.toolCalls = toolCalls.filter((item) => item.name);
    }
    if (!parsed.usage) parsed.usage = usage;
    return parsed;
  }
}

function toGeminiTools(tools: UnifiedToolDefinition[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: tool.parameters.properties || {},
      required: tool.parameters.required,
    },
  }));
}

async function toGeminiContents(messages: UnifiedMessage[]): Promise<Content[]> {
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.name || "tool",
              response: safeJson(contentToText(message.content)),
            },
          },
        ],
      });
      continue;
    }

    if (message.role === "assistant") {
      const parts: Part[] = [];
      const text = contentToText(message.content);
      if (text) parts.push({ text });
      for (const toolCall of message.toolCalls || []) {
        parts.push({
          functionCall: {
            name: toolCall.name,
            args: safeJson(toolCall.arguments),
          },
        });
      }
      contents.push({
        role: "model",
        parts: parts.length > 0 ? parts : [{ text: "" }],
      });
      continue;
    }

    if (typeof message.content === "string") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }

    const parts: Part[] = [];
    for (const part of message.content) {
      if (part.type === "text") {
        parts.push({ text: part.text });
        continue;
      }
      if (part.type === "image") {
        const inline = await maybeInlineData(part.url, part.mediaType);
        if (inline) {
          parts.push({ inlineData: inline });
        } else {
          parts.push({ text: `[image] ${part.url}` });
        }
        continue;
      }
      parts.push({ text: `[video] ${part.url}` });
    }
    contents.push({ role: "user", parts });
  }

  return contents;
}

async function maybeInlineData(
  url: string,
  mediaType?: string,
): Promise<{ data: string; mimeType: string } | null> {
  if (url.startsWith("data:")) {
    const matched = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matched) return null;
    return { mimeType: matched[1], data: matched[2] };
  }
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType =
      mediaType || res.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { mimeType, data: buffer.toString("base64") };
  } catch {
    return null;
  }
}

function parseGeminiResult(
  response: any,
  options: ProviderCompleteOptions,
): ProviderCompleteResponse {
  let content = "";
  let reasoning = "";
  const toolCalls: UnifiedToolCall[] = [];

  try {
    content = response?.text?.() || "";
  } catch {
    content = "";
  }

  const candidates = response?.candidates || [];
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts || []) {
      if (part?.functionCall) {
        toolCalls.push({
          id: `gemini_tool_${toolCalls.length}_${Date.now()}`,
          name: String(part.functionCall.name || ""),
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        });
      }
      if (part?.thought && typeof part.text === "string") {
        reasoning += part.text;
      }
    }
  }

  if (content && options.onTextDelta) {
    void options.onTextDelta(content);
  }

  return {
    content,
    reasoning: reasoning || null,
    toolCalls: toolCalls.filter((item) => item.name),
    usage: extractUsageTokens({
      usage: {
        prompt_tokens: response?.usageMetadata?.promptTokenCount,
        completion_tokens: response?.usageMetadata?.candidatesTokenCount,
        total_tokens: response?.usageMetadata?.totalTokenCount,
        cached_tokens: response?.usageMetadata?.cachedContentTokenCount,
      },
    }),
    raw: buildAssistantRaw(content, toolCalls.filter((item) => item.name)),
  };
}

function buildAssistantRaw(
  content: string,
  toolCalls: UnifiedToolCall[],
): { role: "assistant"; content: string; tool_calls?: any[] } {
  if (toolCalls.length === 0) return { role: "assistant", content };
  return {
    role: "assistant",
    content,
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: { name: toolCall.name, arguments: toolCall.arguments },
    })),
  };
}

function safeJson(value: string): any {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return { result: value };
  }
}
