import type {
  AISkill,
  AITool,
  AIUsageContext,
  AIUsageFinalization,
  AIUsageRange,
  AIUsageSummary,
  ChatRuntime,
  ChatRuntimeBaseOptions,
  ChatRuntimeCollectedInfo,
  ChatRuntimeGroupTarget,
  ChatRuntimeInformationRequestOptions,
  ChatRuntimeNoticeOptions,
  ChatRuntimePrivateTarget,
  ChatRuntimePromptInjection,
  ChatRuntimeResult,
  ChatRuntimeSource,
  CompleteOptions as MiokuCompleteOptions,
  CompleteResponse as MiokuCompleteResponse,
  MultimodalContentItem,
  MultimodalMessage,
  SessionToolDefinition,
  TextMessage,
  TOOL_RESULT_FOLLOWUP_KEY,
  ToolCallRecord,
  ToolResultFollowup,
} from "mioku";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { AIUsageMeasuredTokens } from "./usage/types";

export type {
  AISkill,
  AITool,
  ChatRuntime,
  ChatRuntimeBaseOptions,
  ChatRuntimeCollectedInfo,
  ChatRuntimeGroupTarget,
  ChatRuntimeInformationRequestOptions,
  ChatRuntimeNoticeOptions,
  ChatRuntimePrivateTarget,
  ChatRuntimePromptInjection,
  ChatRuntimeResult,
  ChatRuntimeSource,
  MultimodalContentItem,
  MultimodalMessage,
  SessionToolDefinition,
  TextMessage,
  TOOL_RESULT_FOLLOWUP_KEY,
  ToolCallRecord,
  ToolResultFollowup,
};

// OpenAI-typed overrides of the loose framework CompleteOptions/CompleteResponse.
// The framework keeps `any[]`/`any` so it doesn't depend on the openai package;
// the service impl tightens them for internal type-safety.
export interface CompleteOptions
  extends Omit<MiokuCompleteOptions, "messages" | "tools"> {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
}

export interface CompleteResponse
  extends Omit<MiokuCompleteResponse, "raw" | "turnMessages"> {
  raw: ChatCompletionMessageParam;
  turnMessages?: ChatCompletionMessageParam[];
}

export interface AssistantMessageResult {
  content: string;
  reasoning: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  raw: ChatCompletionMessageParam;
  usage?: AIUsageMeasuredTokens;
}

export interface AIInstance {
  generateText(options: {
    prompt?: string;
    messages: TextMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string>;
  generateMultimodal(options: {
    prompt?: string;
    messages: MultimodalMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<string>;
  generateWithTools(options: {
    prompt?: string;
    messages: TextMessage[] | MultimodalMessage[];
    model?: string;
    temperature?: number;
    maxIterations?: number;
  }): Promise<{
    content: string;
    iterations: number;
    allToolCalls: ToolCallRecord[];
  }>;
  complete(options: CompleteOptions): Promise<CompleteResponse>;
  setUsageContext?(context: AIUsageContext | undefined): void;
  withUsageContext?<T>(
    context: AIUsageContext | undefined,
    fn: () => Promise<T>,
  ): Promise<T>;
  registerPrompt(name: string, prompt: string): boolean;
  getPrompt(name: string): string | undefined;
  getAllPrompts(): Record<string, string>;
  removePrompt(name: string): boolean;
}

export interface AIService {
  create(options: {
    name: string;
    apiUrl: string;
    apiKey: string;
    modelType: "text" | "multimodal";
    model?: string;
  }): Promise<AIInstance>;
  get(name: string): AIInstance | undefined;
  list(): string[];
  remove(name: string): boolean;
  setDefault(name: string): boolean;
  getDefault(): AIInstance | undefined;
  registerChatRuntime(runtime: ChatRuntime): boolean;
  getChatRuntime(): ChatRuntime | undefined;
  removeChatRuntime(): boolean;
  registerSkill(skill: AISkill): boolean;
  getSkill(skillName: string): AISkill | undefined;
  getAllSkills(): Map<string, AISkill>;
  removeSkill(skillName: string): boolean;
  getTool(toolName: string): AITool | undefined;
  getAllTools(): Map<string, AITool>;
  getUsageSummary(options: { range: AIUsageRange; botId?: number }): AIUsageSummary;
  cleanupUsageStats(retentionMs?: number): number;
  finalizeUsage(usageId: string, finalization: AIUsageFinalization): boolean;
}
