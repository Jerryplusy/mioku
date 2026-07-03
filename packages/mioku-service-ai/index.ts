import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "mioki";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AISkill, AITool, MiokuService } from "mioku";
import { createAIUsageStore } from "./usage/store";
import { UsageTracker, extractUsageTokens, mergeMeasuredTokens } from "./usage/tracker";
import {
  runToolLoop,
  parseToolArguments,
  normalizeToolResult,
} from "./core/tool-loop";
import type {
  AIInstance,
  AIService,
  AssistantMessageResult,
  ChatRuntime,
  CompleteOptions,
  CompleteResponse,
  MultimodalMessage,
  TextMessage,
  ToolCallRecord,
} from "./types";
import type {
  AIUsageContext,
  AIUsageFinalization,
  AIUsageMeasuredTokens,
  AIUsageStore,
} from "./usage/types";

const DEFAULT_CHAT_MODEL = "gemini-3.0-flash-preview";

class AIInstanceImpl implements AIInstance {
  private client: OpenAI;
  private prompts = new Map<string, string>();
  private readonly globalSkills: Map<string, AISkill>;
  private readonly usageStore: AIUsageStore;
  private usageContext: AIUsageContext | undefined;
  private readonly defaultModel: string | undefined;

  constructor(
    apiUrl: string,
    apiKey: string,
    defaultModel: string | undefined,
    globalSkills: Map<string, AISkill>,
    usageStore: AIUsageStore,
  ) {
    this.client = new OpenAI({ baseURL: apiUrl, apiKey });
    this.defaultModel = defaultModel;
    this.globalSkills = globalSkills;
    this.usageStore = usageStore;
  }

  async generateText(options: {
    prompt?: string;
    messages: TextMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    const model = await this.resolveModel(options.model);
    const composed: ChatCompletionMessageParam[] = options.prompt
      ? [{ role: "system", content: options.prompt }, ...options.messages]
      : [...options.messages];

    // Some upstreams reject system-only requests with 400 "chat content is empty".
    const messages: ChatCompletionMessageParam[] = composed.some((m) => m.role === "user")
      ? composed
      : [...composed, { role: "user", content: "." }];

    const response = await this.complete({
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
    });
    return response.content || "";
  }

  async generateMultimodal(options: {
    prompt?: string;
    messages: MultimodalMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    const model = await this.resolveModel(options.model);
    const messages = this.convertMessages(options.messages);
    const composed: ChatCompletionMessageParam[] = options.prompt
      ? [{ role: "system", content: options.prompt }, ...messages]
      : messages;

    const withUserTurn: ChatCompletionMessageParam[] = composed.some((m) =>
      m.role === "user",
    )
      ? composed
      : [...composed, { role: "user", content: "." }];

    const response = await this.complete({
      model,
      messages: withUserTurn,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
    });
    return response.content || "";
  }

  async complete(options: CompleteOptions): Promise<CompleteResponse> {
    const model = await this.resolveModel(options.model);
    const tracker = new UsageTracker({
      model,
      stream: Boolean(options.stream),
      context: options.usageContext ?? this.usageContext,
      startedAt: Date.now(),
      initialMessages: options.messages,
      initialTools: options.tools,
      explicitContextTokens: options.usageContextTokens,
      explicitBreakdown: options.usageBreakdown,
      usageStore: this.usageStore,
    });

    try {
      const hasExecutableTools =
        (options.executableTools && options.executableTools.length > 0) ||
        !!options.executableToolsProvider;
      const response = hasExecutableTools
        ? await this.completeWithExecutableTools(options, model, tracker)
        : await this.completeOnce(options, model, tracker);
      tracker.finish(true);
      return response;
    } catch (error) {
      tracker.finish(false, String(error));
      throw error;
    }
  }

  setUsageContext(context: AIUsageContext | undefined): void {
    this.usageContext = context;
  }

  async withUsageContext<T>(
    context: AIUsageContext | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.usageContext;
    this.usageContext = context;
    try {
      return await fn();
    } finally {
      this.usageContext = previous;
    }
  }

  private async completeOnce(
    options: CompleteOptions,
    model: string,
    tracker: UsageTracker,
  ): Promise<CompleteResponse> {
    const assistant = await this.requestAssistantMessage({
      model,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: options.stream,
      onTextDelta: options.onTextDelta,
    });
    tracker.recordAssistant(assistant);
    if (assistant.usage) tracker.recordMeasuredTokens(assistant.usage);

    return {
      content: assistant.content || null,
      reasoning: assistant.reasoning,
      toolCalls: assistant.toolCalls,
      raw: assistant.raw,
      turnMessages: [assistant.raw],
    };
  }

  private async completeWithExecutableTools(
    options: CompleteOptions,
    model: string,
    tracker: UsageTracker,
  ): Promise<CompleteResponse> {
    return runToolLoop(
      {
        requestAssistantMessage: (args) => this.requestAssistantMessage(args),
        globalSkillNames: [...this.globalSkills.keys()],
      },
      options,
      model,
      tracker,
    );
  }

  private async requestAssistantMessage(args: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature: number;
    max_tokens?: number;
    stream?: boolean;
    onTextDelta?: (delta: string) => void | Promise<void>;
  }): Promise<AssistantMessageResult> {
    if (args.stream) return this.requestAssistantMessageStream(args);
    return this.requestAssistantMessageNonStream(args);
  }

  private async requestAssistantMessageNonStream(args: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature: number;
    max_tokens?: number;
  }): Promise<AssistantMessageResult> {
    const response = await this.client.chat.completions.create({
      model: args.model,
      messages: args.messages,
      tools: args.tools,
      temperature: args.temperature,
      ...(args.max_tokens != null && { max_completion_tokens: args.max_tokens }),
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return {
        content: "",
        reasoning: null,
        toolCalls: [],
        raw: { role: "assistant", content: "" },
        usage: extractUsageTokens(response),
      };
    }

    const reasoning =
      (message as any).reasoning_content || (message as any).reasoning || null;
    const toolCalls = (message.tool_calls || [])
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

    return {
      content: extractTextContent(message.content),
      reasoning,
      toolCalls,
      raw: message as ChatCompletionMessageParam,
      usage: extractUsageTokens(response),
    };
  }

  private async requestAssistantMessageStream(args: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature: number;
    max_tokens?: number;
    onTextDelta?: (delta: string) => void | Promise<void>;
  }): Promise<AssistantMessageResult> {
    const stream = await this.client.chat.completions.create({
      model: args.model,
      messages: args.messages,
      tools: args.tools,
      temperature: args.temperature,
      stream: true,
      ...(args.max_tokens != null && { max_completion_tokens: args.max_tokens }),
    });

    let content = "";
    let reasoning = "";
    let streamUsage: AIUsageMeasuredTokens | undefined;
    const toolCallsByIndex = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream as AsyncIterable<any>) {
      const choice = chunk?.choices?.[0];
      const chunkUsage = extractUsageTokens(chunk);
      if (chunkUsage) streamUsage = mergeMeasuredTokens(streamUsage, chunkUsage);
      const delta = choice?.delta;
      if (!delta) continue;

      const textDelta = extractTextDelta(delta.content);
      if (textDelta) {
        content += textDelta;
        await args.onTextDelta?.(textDelta);
      }

      if (typeof delta.reasoning_content === "string") {
        reasoning += delta.reasoning_content;
      } else if (typeof delta.reasoning === "string") {
        reasoning += delta.reasoning;
      }

      const deltaToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const item of deltaToolCalls) {
        const index =
          typeof item?.index === "number" && item.index >= 0 ? item.index : 0;
        const acc = toolCallsByIndex.get(index) || { id: "", name: "", arguments: "" };
        if (typeof item?.id === "string" && item.id) acc.id = item.id;
        if (typeof item?.function?.name === "string" && item.function.name) {
          acc.name += item.function.name;
        }
        if (
          typeof item?.function?.arguments === "string" &&
          item.function.arguments
        ) {
          acc.arguments += item.function.arguments;
        }
        toolCallsByIndex.set(index, acc);
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
      raw: buildAssistantRawMessage(content, toolCalls),
      usage: streamUsage,
    };
  }

  async generateWithTools(options: {
    prompt?: string;
    messages: TextMessage[] | MultimodalMessage[];
    model?: string;
    temperature?: number;
    maxIterations?: number;
  }): Promise<{
    content: string;
    iterations: number;
    allToolCalls: ToolCallRecord[];
  }> {
    const executableTools = [];
    for (const [skillName, skill] of this.globalSkills) {
      for (const tool of skill.tools) {
        executableTools.push({
          name: `${skillName}.${tool.name}`,
          tool: {
            ...tool,
            description: `[${skillName}] ${tool.description}`,
          },
        });
      }
    }

    let messages = this.convertMessages(options.messages);
    if (options.prompt) {
      messages = [{ role: "system", content: options.prompt }, ...messages];
    }

    const response = await this.complete({
      model: options.model,
      messages,
      executableTools,
      temperature: options.temperature,
      maxIterations: options.maxIterations,
    });

    return {
      content: response.content || "",
      iterations: response.iterations ?? 1,
      allToolCalls: response.allToolCalls || [],
    };
  }

  private convertMessages(
    messages: TextMessage[] | MultimodalMessage[],
  ): ChatCompletionMessageParam[] {
    if (messages.length === 0) return [];
    const first = messages[0];
    if (typeof first.content === "string") {
      return [...(messages as TextMessage[])];
    }
    return (messages as MultimodalMessage[]).map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content } as ChatCompletionMessageParam;
      }
      return {
        role: msg.role,
        content: msg.content.map((item) =>
          item.type === "text"
            ? { type: "text" as const, text: item.text || "" }
            : {
                type: "image_url" as const,
                image_url: item.image_url!,
              },
        ),
      } as ChatCompletionMessageParam;
    });
  }

  registerPrompt(name: string, prompt: string): boolean {
    if (this.prompts.has(name)) logger.warn(`Prompt ${name} already exists, overwriting`);
    this.prompts.set(name, prompt);
    logger.info(`Prompt ${name} registered successfully`);
    return true;
  }

  getPrompt(name: string): string | undefined {
    return this.prompts.get(name);
  }

  getAllPrompts(): Record<string, string> {
    return Object.fromEntries(this.prompts.entries());
  }

  removePrompt(name: string): boolean {
    const deleted = this.prompts.delete(name);
    if (deleted) logger.info(`Prompt ${name} removed`);
    return deleted;
  }

  private async resolveModel(model?: string): Promise<string> {
    const explicitModel = String(model || "").trim();
    if (explicitModel) return explicitModel;
    return (await readChatPrimaryModel()) || DEFAULT_CHAT_MODEL;
  }
}

class AIServiceImpl implements AIService {
  private instances = new Map<string, AIInstance>();
  private globalSkills = new Map<string, AISkill>();
  private toolIndex = new Map<string, AITool>();
  private bareToolIndex = new Map<string, AITool>();
  private defaultInstanceName: string | null = null;
  private chatRuntime: ChatRuntime | null = null;
  private readonly usageStore: AIUsageStore;

  constructor(usageStore: AIUsageStore) {
    this.usageStore = usageStore;
  }

  async create(options: {
    name: string;
    apiUrl: string;
    apiKey: string;
    modelType: "text" | "multimodal";
    model?: string;
  }): Promise<AIInstance> {
    if (this.instances.has(options.name)) {
      logger.error(`AI instance ${options.name} already exists`);
    }
    const instance = new AIInstanceImpl(
      options.apiUrl,
      options.apiKey,
      options.model,
      this.globalSkills,
      this.usageStore,
    );
    this.instances.set(options.name, instance);
    logger.info(`AI instance ${options.name} created successfully`);
    return instance;
  }

  get(name: string): AIInstance | undefined {
    return this.instances.get(name);
  }

  list(): string[] {
    return [...this.instances.keys()];
  }

  remove(name: string): boolean {
    const deleted = this.instances.delete(name);
    if (deleted) {
      if (this.defaultInstanceName === name) this.defaultInstanceName = null;
      logger.info(`AI instance ${name} removed`);
    }
    return deleted;
  }

  setDefault(name: string): boolean {
    if (!this.instances.has(name)) {
      logger.warn(`Cannot set default: AI instance ${name} not found`);
      return false;
    }
    this.defaultInstanceName = name;
    logger.info(`Default AI instance set to ${name}`);
    return true;
  }

  getDefault(): AIInstance | undefined {
    return this.defaultInstanceName
      ? this.instances.get(this.defaultInstanceName)
      : undefined;
  }

  registerChatRuntime(runtime: ChatRuntime): boolean {
    this.chatRuntime = runtime;
    logger.info("Chat runtime registered successfully");
    return true;
  }

  getChatRuntime(): ChatRuntime | undefined {
    return this.chatRuntime ?? undefined;
  }

  removeChatRuntime(): boolean {
    if (!this.chatRuntime) return false;
    this.chatRuntime = null;
    logger.info("Chat runtime removed");
    return true;
  }

  registerSkill(skill: AISkill): boolean {
    if (this.globalSkills.has(skill.name)) {
      logger.warn(`Skill ${skill.name} already exists, overwriting`);
    }
    this.globalSkills.set(skill.name, skill);
    this.rebuildToolIndex();
    logger.info(`Skill ${skill.name} registered with ${skill.tools.length} tools`);
    return true;
  }

  getSkill(skillName: string): AISkill | undefined {
    return this.globalSkills.get(skillName);
  }

  getAllSkills(): Map<string, AISkill> {
    return this.globalSkills;
  }

  removeSkill(skillName: string): boolean {
    const deleted = this.globalSkills.delete(skillName);
    if (deleted) {
      this.rebuildToolIndex();
      logger.info(`Skill ${skillName} removed`);
    }
    return deleted;
  }

  getTool(toolName: string): AITool | undefined {
    const parts = toolName.split(".");
    if (parts.length === 2) return this.toolIndex.get(toolName);
    return this.bareToolIndex.get(toolName);
  }

  getAllTools(): Map<string, AITool> {
    return new Map(this.toolIndex);
  }

  getUsageSummary(options: Parameters<AIService["getUsageSummary"]>[0]) {
    return this.usageStore.getSummary(options);
  }

  cleanupUsageStats(retentionMs?: number): number {
    return this.usageStore.cleanup(retentionMs);
  }

  finalizeUsage(usageId: string, finalization: AIUsageFinalization): boolean {
    return this.usageStore.updateFinalization(usageId, finalization);
  }

  dispose(): void {
    this.usageStore.close();
  }

  private rebuildToolIndex(): void {
    this.toolIndex.clear();
    this.bareToolIndex.clear();
    for (const [skillName, skill] of this.globalSkills) {
      for (const tool of skill.tools) {
        this.toolIndex.set(`${skillName}.${tool.name}`, tool);
        if (!this.bareToolIndex.has(tool.name)) {
          this.bareToolIndex.set(tool.name, tool);
        }
      }
    }
  }
}

async function readChatPrimaryModel(): Promise<string | undefined> {
  const configPath = path.join(process.cwd(), "config", "chat", "base.json");
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8"));
    const model = String(parsed?.model || "").trim();
    return model || undefined;
  } catch {
    return undefined;
  }
}

function extractTextContent(
  content: ChatCompletionMessageParam["content"] | null | undefined,
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(part && part.type === "text"),
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractTextDelta(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || part.type !== "text") return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

function buildAssistantRawMessage(
  content: string,
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
): ChatCompletionMessageParam {
  if (toolCalls.length === 0) return { role: "assistant", content };
  return {
    role: "assistant",
    content,
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function" as const,
      function: { name: toolCall.name, arguments: toolCall.arguments },
    })),
  } as ChatCompletionMessageParam;
}

const aiService: MiokuService = {
  name: "ai",
  version: "1.0.0",
  description:
    "为插件提供完整的ai服务支持，包括ai实例管理，提示词管理，skills管理等",
  api: {} as AIService,

  async init() {
    this.api = new AIServiceImpl(createAIUsageStore());
    logger.info("ai-service 服务已就绪");
  },

  async dispose() {
    const api = this.api as AIService & { dispose?: () => void };
    api.dispose?.();
    logger.info("ai-service 已卸载");
  },
};

export default aiService;

export { parseToolArguments, normalizeToolResult };
