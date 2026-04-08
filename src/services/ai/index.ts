import { logger } from "mioki";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AITool, AISkill, MiokuService } from "../../core/types";

/**
 * 文本消息
 */
export interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 多模态消息内容项
 */
export interface MultimodalContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

/**
 * 多模态消息
 */
export interface MultimodalMessage {
  role: "system" | "user" | "assistant";
  content: string | MultimodalContentItem[];
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  name: string;
  arguments: any;
  result: any;
}

/**
 * 原始补全请求参数
 */
export interface CompleteOptions {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  executableTools?: SessionToolDefinition[];
  executableToolsProvider?: () => SessionToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  maxIterations?: number;
  stream?: boolean;
  onTextDelta?: (delta: string) => void | Promise<void>;
}

/**
 * 原始补全响应
 */
export interface CompleteResponse {
  content: string | null;
  reasoning: string | null;
  toolCalls: {
    id: string;
    name: string;
    arguments: string;
  }[];
  raw: ChatCompletionMessageParam;
  iterations?: number;
  allToolCalls?: ToolCallRecord[];
  turnMessages?: ChatCompletionMessageParam[];
}

export interface SessionToolDefinition {
  name: string;
  tool: AITool;
}

/**
 * AI 实例接口
 */
export interface AIInstance {
  generateText(options: {
    prompt?: string;
    messages: TextMessage[];
    model: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string>;

  generateMultimodal(options: {
    prompt?: string;
    messages: MultimodalMessage[];
    model: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string>;

  generateWithTools(options: {
    prompt?: string;
    messages: TextMessage[] | MultimodalMessage[];
    model: string;
    temperature?: number;
    maxIterations?: number;
  }): Promise<{
    content: string;
    iterations: number;
    allToolCalls: ToolCallRecord[];
  }>;

  /**
   * 原始补全调用，提供对 OpenAI API 的直接访问。
   * 当传入 executableTools 时，会在当前请求内执行标准 tool loop。
   */
  complete(options: CompleteOptions): Promise<CompleteResponse>;

  registerPrompt(name: string, prompt: string): boolean;
  getPrompt(name: string): string | undefined;
  getAllPrompts(): Record<string, string>;
  removePrompt(name: string): boolean;
}

/**
 * AI 服务接口
 */
export interface AIService {
  // 实例管理
  create(options: {
    name: string;
    apiUrl: string;
    apiKey: string;
    modelType: "text" | "multimodal";
  }): Promise<AIInstance>;
  get(name: string): AIInstance | undefined;
  list(): string[];
  remove(name: string): boolean;

  // 默认实例
  setDefault(name: string): boolean;
  getDefault(): AIInstance | undefined;

  // Skill 管理
  registerSkill(skill: AISkill): boolean;
  getSkill(skillName: string): AISkill | undefined;
  getAllSkills(): Map<string, AISkill>;
  removeSkill(skillName: string): boolean;

  // 工具查询（扁平化访问）
  getTool(toolName: string): AITool | undefined;
  getAllTools(): Map<string, AITool>;
}

interface AssistantMessageResult {
  content: string;
  reasoning: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  raw: ChatCompletionMessageParam;
}

/**
 * AI 实例实现
 */
class AIInstanceImpl implements AIInstance {
  private client: OpenAI;
  private prompts: Map<string, string> = new Map();
  private readonly globalSkills: Map<string, AISkill>;

  constructor(
    apiUrl: string,
    apiKey: string,
    _modelType: "text" | "multimodal",
    globalSkills: Map<string, AISkill>,
  ) {
    this.client = new OpenAI({
      baseURL: apiUrl,
      apiKey: apiKey,
    });
    this.globalSkills = globalSkills;
  }

  async generateText(options: {
    prompt?: string;
    messages: TextMessage[];
    model: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    const messages: ChatCompletionMessageParam[] = options.prompt
      ? [{ role: "system", content: options.prompt }, ...options.messages]
      : [...options.messages];

    const response = await this.client.chat.completions.create({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      ...(options.max_tokens != null && {
        max_completion_tokens: options.max_tokens,
      }),
    });

    return response.choices[0]?.message?.content || "";
  }

  async generateMultimodal(options: {
    prompt?: string;
    messages: MultimodalMessage[];
    model: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    const convertedMessages: ChatCompletionMessageParam[] =
      options.messages.map((msg) => {
        if (typeof msg.content === "string") {
          return {
            role: msg.role,
            content: msg.content,
          } as ChatCompletionMessageParam;
        } else {
          return {
            role: msg.role,
            content: msg.content.map((item) => {
              if (item.type === "text") {
                return { type: "text" as const, text: item.text || "" };
              } else {
                return {
                  type: "image_url" as const,
                  image_url: item.image_url!,
                };
              }
            }),
          } as ChatCompletionMessageParam;
        }
      });

    const messages: ChatCompletionMessageParam[] = options.prompt
      ? [{ role: "system", content: options.prompt }, ...convertedMessages]
      : convertedMessages;

    const response = await this.client.chat.completions.create({
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      ...(options.max_tokens != null && {
        max_completion_tokens: options.max_tokens,
      }),
    });

    return response.choices[0]?.message?.content || "";
  }

  async complete(options: CompleteOptions): Promise<CompleteResponse> {
    if (
      (options.executableTools && options.executableTools.length > 0) ||
      options.executableToolsProvider
    ) {
      return this.completeWithExecutableTools(options);
    }

    const assistant = await this.requestAssistantMessage({
      model: options.model,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: options.stream,
      onTextDelta: options.onTextDelta,
    });

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

      const assistant = await this.requestAssistantMessage({
        model: options.model,
        messages: sessionMessages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
        stream: options.stream,
        onTextDelta: options.onTextDelta,
      });

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
            `[ai] Tool ${toolName} not found (raw: "${toolName}"). Executable tools: ${[...toolMap.keys()].join(", ") || "(none)"}. Global skills: ${[...this.globalSkills.keys()].join(", ") || "(none)"}`,
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

        if (isToolErrorResult(result)) {
          failedToolCallKeys.add(callKey);
        }

        allToolCalls.push({
          name: toolName,
          arguments: args,
          result,
        });

        const toolMessage = {
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        } as ChatCompletionMessageParam;

        sessionMessages.push(toolMessage);
        turnMessages.push(toolMessage);
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

  private async requestAssistantMessage(args: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature: number;
    max_tokens?: number;
    stream?: boolean;
    onTextDelta?: (delta: string) => void | Promise<void>;
  }): Promise<AssistantMessageResult> {
    if (args.stream) {
      return this.requestAssistantMessageStream(args);
    }
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
      ...(args.max_tokens != null && {
        max_completion_tokens: args.max_tokens,
      }),
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return {
        content: "",
        reasoning: null,
        toolCalls: [],
        raw: { role: "assistant", content: "" },
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
      ...(args.max_tokens != null && {
        max_completion_tokens: args.max_tokens,
      }),
    });

    let content = "";
    let reasoning = "";
    const toolCallsByIndex = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream as AsyncIterable<any>) {
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta;
      if (!delta) continue;

      const textDelta = extractTextDelta(delta.content);
      if (textDelta) {
        content += textDelta;
        if (args.onTextDelta) {
          await args.onTextDelta(textDelta);
        }
      }

      if (typeof delta.reasoning_content === "string") {
        reasoning += delta.reasoning_content;
      } else if (typeof delta.reasoning === "string") {
        reasoning += delta.reasoning;
      }

      const deltaToolCalls = Array.isArray(delta.tool_calls)
        ? delta.tool_calls
        : [];
      for (const item of deltaToolCalls) {
        const index =
          typeof item?.index === "number" && item.index >= 0 ? item.index : 0;
        const acc = toolCallsByIndex.get(index) || {
          id: "",
          name: "",
          arguments: "",
        };

        if (typeof item?.id === "string" && item.id) {
          acc.id = item.id;
        }
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
    };
  }

  async generateWithTools(options: {
    prompt?: string;
    messages: TextMessage[] | MultimodalMessage[];
    model: string;
    temperature?: number;
    maxIterations?: number;
  }): Promise<{
    content: string;
    iterations: number;
    allToolCalls: ToolCallRecord[];
  }> {
    const executableTools: SessionToolDefinition[] = [];

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

    const firstMsg = messages[0];
    if (typeof firstMsg.content === "string") {
      return [...(messages as TextMessage[])];
    } else {
      return (messages as MultimodalMessage[]).map((msg) => {
        if (typeof msg.content === "string") {
          return {
            role: msg.role,
            content: msg.content,
          } as ChatCompletionMessageParam;
        } else {
          return {
            role: msg.role,
            content: msg.content.map((item) => {
              if (item.type === "text") {
                return { type: "text" as const, text: item.text || "" };
              } else {
                return {
                  type: "image_url" as const,
                  image_url: item.image_url!,
                };
              }
            }),
          } as ChatCompletionMessageParam;
        }
      });
    }
  }

  registerPrompt(name: string, prompt: string): boolean {
    if (this.prompts.has(name)) {
      logger.warn(`Prompt ${name} already exists, overwriting`);
    }
    this.prompts.set(name, prompt);
    logger.info(`Prompt ${name} registered successfully`);
    return true;
  }

  getPrompt(name: string): string | undefined {
    return this.prompts.get(name);
  }

  getAllPrompts(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, prompt] of this.prompts.entries()) {
      result[name] = prompt;
    }
    return result;
  }

  removePrompt(name: string): boolean {
    const deleted = this.prompts.delete(name);
    if (deleted) {
      logger.info(`Prompt ${name} removed`);
    }
    return deleted;
  }
}

/**
 * AI 服务实现
 */
class AIServiceImpl implements AIService {
  private instances: Map<string, AIInstance> = new Map();
  private globalSkills: Map<string, AISkill> = new Map();
  private defaultInstanceName: string | null = null;

  constructor() {}

  async create(options: {
    name: string;
    apiUrl: string;
    apiKey: string;
    modelType: "text" | "multimodal";
  }): Promise<AIInstance> {
    if (this.instances.has(options.name)) {
      logger.error(`AI instance ${options.name} already exists`);
    }

    const instance = new AIInstanceImpl(
      options.apiUrl,
      options.apiKey,
      options.modelType,
      this.globalSkills,
    );

    this.instances.set(options.name, instance);
    logger.info(`AI instance ${options.name} created successfully`);
    return instance;
  }

  get(name: string): AIInstance | undefined {
    return this.instances.get(name);
  }

  list(): string[] {
    return Array.from(this.instances.keys());
  }

  remove(name: string): boolean {
    const deleted = this.instances.delete(name);
    if (deleted) {
      if (this.defaultInstanceName === name) {
        this.defaultInstanceName = null;
      }
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
    if (this.defaultInstanceName) {
      return this.instances.get(this.defaultInstanceName);
    }
    return undefined;
  }

  registerSkill(skill: AISkill): boolean {
    if (this.globalSkills.has(skill.name)) {
      logger.warn(`Skill ${skill.name} already exists, overwriting`);
    }
    this.globalSkills.set(skill.name, skill);
    logger.info(
      `Skill ${skill.name} registered with ${skill.tools.length} tools`,
    );
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
      logger.info(`Skill ${skillName} removed`);
    }
    return deleted;
  }

  getTool(toolName: string): AITool | undefined {
    // 支持两种格式：skillName.toolName 或 toolName
    const parts = toolName.split(".");
    if (parts.length === 2) {
      const [skillName, toolNameOnly] = parts;
      const skill = this.globalSkills.get(skillName);
      return skill?.tools.find((t) => t.name === toolNameOnly);
    } else {
      // 遍历所有 skills 查找工具
      for (const skill of this.globalSkills.values()) {
        const tool = skill.tools.find((t) => t.name === toolName);
        if (tool) return tool;
      }
    }
    return undefined;
  }

  getAllTools(): Map<string, AITool> {
    const allTools = new Map<string, AITool>();
    for (const [skillName, skill] of this.globalSkills) {
      for (const tool of skill.tools) {
        const fullName = `${skillName}.${tool.name}`;
        allTools.set(fullName, tool);
      }
    }
    return allTools;
  }
}

function parseToolArguments(raw: string): any {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function isToolErrorResult(result: any): boolean {
  if (!result || typeof result !== "object") return false;
  if (result.error) return true;
  return result.success === false;
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

function extractTextContent(
  content: ChatCompletionMessageParam["content"] | null | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part): part is { type: "text"; text: string } => {
      return Boolean(part && part.type === "text");
    })
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractTextDelta(content: any): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

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
  if (toolCalls.length === 0) {
    return { role: "assistant", content };
  }

  return {
    role: "assistant",
    content,
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function" as const,
      function: {
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
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
    this.api = new AIServiceImpl();
    logger.info("ai-service 服务已就绪");
  },

  async dispose() {
    logger.info("ai-service 已卸载");
  },
};

export default aiService;
