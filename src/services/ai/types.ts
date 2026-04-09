import type { AISkill, AITool } from "../../core/types";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

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

export type ChatRuntimePromptInjectionPlacement =
  | "target_message"
  | "reply_context"
  | "persona";

export interface ChatRuntimePromptInjection {
  content: string;
  placement?: ChatRuntimePromptInjectionPlacement;
  title?: string;
}

export interface ChatRuntimeBaseOptions {
  event: any;
  targetMessage?: string;
  promptInjections?: ChatRuntimePromptInjection[];
  send?: boolean;
}

export interface ChatRuntimeInformationRequestOptions extends ChatRuntimeBaseOptions {
  task: string;
  schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  placement?: ChatRuntimePromptInjectionPlacement;
  toolName?: string;
  toolDescription?: string;
}

export interface ChatRuntimeNoticeOptions extends ChatRuntimeBaseOptions {
  instruction: string;
  placement?: ChatRuntimePromptInjectionPlacement;
}

export interface ChatRuntimeCollectedInfo {
  data: any;
  isComplete?: boolean;
  confidence?: number;
  notes?: string;
}

export interface ChatRuntimeResult {
  messages: string[];
  toolCalls: ToolCallRecord[];
  collectedInfo: ChatRuntimeCollectedInfo | null;
}

export interface ChatRuntime {
  requestInformation(
    options: ChatRuntimeInformationRequestOptions,
  ): Promise<ChatRuntimeResult>;
  generateNotice(options: ChatRuntimeNoticeOptions): Promise<ChatRuntimeResult>;
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

  // Chat Runtime
  registerChatRuntime(runtime: ChatRuntime): boolean;
  getChatRuntime(): ChatRuntime | undefined;
  removeChatRuntime(): boolean;

  // Skill 管理
  registerSkill(skill: AISkill): boolean;
  getSkill(skillName: string): AISkill | undefined;
  getAllSkills(): Map<string, AISkill>;
  removeSkill(skillName: string): boolean;

  // 工具查询（扁平化访问）
  getTool(toolName: string): AITool | undefined;
  getAllTools(): Map<string, AITool>;
}

export interface AssistantMessageResult {
  content: string;
  reasoning: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  raw: ChatCompletionMessageParam;
}
