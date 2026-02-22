import { logger, MiokiContext } from "mioki";
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
  returnedToAI: boolean;
}

/**
 * 原始补全请求参数
 */
export interface CompleteOptions {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  temperature?: number;
  max_tokens?: number;
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
   * 原始补全调用，提供对 OpenAI API 的直接访问
   * 适用于需要自行管理工具循环、消息流的场景
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

/**
 * AI 实例实现
 */
class AIInstanceImpl implements AIInstance {
  private client: OpenAI;
  private prompts: Map<string, string> = new Map();
  private globalSkills: Map<string, AISkill>;

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
      ...(options.max_tokens != null && { max_tokens: options.max_tokens }),
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
      ...(options.max_tokens != null && { max_tokens: options.max_tokens }),
    });

    return response.choices[0]?.message?.content || "";
  }

  async complete(options: CompleteOptions): Promise<CompleteResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature ?? 0.7,
      ...(options.max_tokens != null && { max_tokens: options.max_tokens }),
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return { content: null, reasoning: null, toolCalls: [], raw: { role: "assistant", content: "" } };
    }

    const reasoning = (message as any).reasoning_content || (message as any).reasoning || null;
    const toolCalls = (message.tool_calls || [])
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

    return {
      content: message.content,
      reasoning,
      toolCalls,
      raw: message as ChatCompletionMessageParam,
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
    const maxIterations = options.maxIterations ?? 40;
    let iterations = 0;
    const allToolCalls: ToolCallRecord[] = [];

    // 构建工具列表（扁平化所有 skills 的工具）
    const tools: ChatCompletionTool[] = [];
    const toolMap = new Map<string, AITool>();

    for (const [skillName, skill] of this.globalSkills) {
      for (const tool of skill.tools) {
        const fullToolName = `${skillName}.${tool.name}`;
        tools.push({
          type: "function",
          function: {
            name: fullToolName,
            description: `[${skillName}] ${tool.description}`,
            parameters: tool.parameters,
          },
        });
        toolMap.set(fullToolName, tool);
      }
    }

    let currentMessages = this.convertMessages(options.messages);
    if (options.prompt) {
      currentMessages = [
        { role: "system", content: options.prompt },
        ...currentMessages,
      ];
    }

    let content = "";

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.chat.completions.create({
        model: options.model,
        messages: currentMessages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: options.temperature ?? 0.7,
      });

      const message = response.choices[0]?.message;
      if (!message) break;

      content = message.content || "";
      currentMessages.push(message as ChatCompletionMessageParam);

      // 检查是否有工具调用
      if (message.tool_calls && message.tool_calls.length > 0) {
        let hasReturnToAI = false;

        for (const toolCall of message.tool_calls) {
          if (toolCall.type === "function") {
            const toolName = toolCall.function.name;
            const tool = toolMap.get(toolName);

            if (!tool) {
              logger.warn(`Tool ${toolName} not found`);
              // OpenAI 要求所有 tool_call 都必须有对应的 tool result
              currentMessages.push({
                role: "tool",
                content: JSON.stringify({ error: `Tool ${toolName} not found` }),
                tool_call_id: toolCall.id,
              } as ChatCompletionMessageParam);
              continue;
            }

            try {
              const args = JSON.parse(toolCall.function.arguments);
              const result = await tool.handler(args);
              const returnedToAI = tool.returnToAI ?? false;

              allToolCalls.push({
                name: toolName,
                arguments: args,
                result,
                returnedToAI,
              });

              // 始终推送工具结果到消息列表（OpenAI 要求所有 tool_call 都必须有结果）
              currentMessages.push({
                role: "tool",
                content: JSON.stringify(result),
                tool_call_id: toolCall.id,
              } as ChatCompletionMessageParam);

              if (returnedToAI) {
                hasReturnToAI = true;
              }
            } catch (error) {
              logger.error(`Tool ${toolName} execution failed: ${error}`);
              const errorResult = { error: String(error) };
              const returnedToAI = tool.returnToAI ?? false;

              allToolCalls.push({
                name: toolName,
                arguments: toolCall.function.arguments,
                result: errorResult,
                returnedToAI,
              });

              // 始终推送错误结果到消息列表
              currentMessages.push({
                role: "tool",
                content: JSON.stringify(errorResult),
                tool_call_id: toolCall.id,
              } as ChatCompletionMessageParam);

              if (returnedToAI) {
                hasReturnToAI = true;
              }
            }
          }
        }

        if (!hasReturnToAI) {
          return {
            content,
            iterations,
            allToolCalls,
          };
        }
      } else {
        // 没有工具调用，结束
        return {
          content,
          iterations,
          allToolCalls,
        };
      }
    }

    logger.warn(
      `Reached maximum iterations (${maxIterations}) for generateWithTools`,
    );
    return {
      content: "达到最大迭代次数限制",
      iterations,
      allToolCalls,
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

const aiService: MiokuService = {
  name: "ai",
  version: "1.0.0",
  description:
    "为插件提供完整的ai服务支持，包括ai实例管理，提示词管理，skills管理等",
  api: {} as AIService,

  async init(ctx: MiokiContext) {
    this.api = new AIServiceImpl();
    logger.info("ai-service 服务已就绪");
  },

  async dispose() {
    logger.info("ai-service 已卸载");
  },
};

export default aiService;
