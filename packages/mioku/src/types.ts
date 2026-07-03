// Mioku framework types — single source of truth for the public API surface.

// ---------- framework ----------

export interface MiokuService {
  name: string;
  version: string;
  description?: string;
  init(): Promise<void>;
  api: Record<string, any>;
  dispose?(): Promise<void>;
}

export interface MiokuRuntimeConfig {
  plugins?: string[];
  plugins_dir?: string;
  services_dir?: string;
  [key: string]: unknown;
}

export interface PackageJsonLike {
  name?: string;
  version?: string;
  description?: string;
  mioki?: MiokuRuntimeConfig;
  mioku?: PluginPackageConfig;
  dependencies?: Record<string, string>;
}

export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  path: string;
  packageJson: PackageJsonLike;
  config: PluginPackageConfig;
}

export interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  path: string;
  packageJson: PackageJsonLike;
}

// ---------- plugin package config ----------

export interface PluginPackageConfig {
  services?: string[];
  help?: PluginHelp;
  accessHooks?: AccessHook[];
}

export interface PluginHelp {
  title: string;
  description: string;
  commands: Array<{
    cmd: string;
    desc: string;
    usage?: string;
    role?: CommandRole;
  }>;
}

export type CommandRole = "master" | "admin" | "owner" | "member";

export interface AccessHook {
  id: string;
  match?: string;
  event?: string;
  description?: string;
}

export type AccessAction = "allow" | "block";

export interface AccessRuleEntry {
  action: AccessAction;
}

export interface AccessScopeConfig {
  plugins?: Record<string, AccessRuleEntry>;
  commands?: Record<string, Record<string, AccessRuleEntry>>;
}

export interface AccessControlConfig {
  version: 1;
  global: AccessScopeConfig;
  groups: Record<string, AccessScopeConfig>;
  users: Record<string, AccessScopeConfig>;
}

// ---------- built-in service contracts ----------

export interface ConfigService {
  registerConfig(pluginName: string, configName: string, initialConfig: any): Promise<boolean>;
  updateConfig(pluginName: string, configName: string, updates: any): Promise<boolean>;
  getConfig(pluginName: string, configName: string): Promise<any>;
  getPluginConfigs(pluginName: string): Promise<Record<string, any>>;
  onConfigChange(pluginName: string, configName: string, callback: (newConfig: any) => void): () => void;
}

export interface ScreenshotService {
  screenshot(html: string, options?: any): Promise<string>;
  screenshotMarkdown(markdownContent: string, options?: any): Promise<string>;
  screenshotFromUrl(url: string, options?: any): Promise<string>;
  cleanupTemp(olderThanMs?: number): Promise<number>;
}

export interface HelpService {
  registerHelp(pluginName: string, help: PluginHelp): void;
  getHelp(pluginName: string): PluginHelp | undefined;
  getAllHelp(): Map<string, PluginHelp>;
  unregisterHelp(pluginName: string): boolean;
}

export interface WebUIService {
  getSettings(): { port: number; host: string; packageManager: string };
}

// ---------- AI service ----------

export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, event?: any) => Promise<any> | any;
}

export type SkillPermissionRole = "owner" | "admin" | "member";

export interface AISkill {
  name: string;
  description: string;
  permission?: SkillPermissionRole;
  tools: AITool[];
}

export interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MultimodalContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface MultimodalMessage {
  role: "system" | "user" | "assistant";
  content: string | MultimodalContentItem[];
}

export interface ToolCallRecord {
  name: string;
  arguments: any;
  result: any;
}

export interface SessionToolDefinition {
  name: string;
  tool: AITool;
}

export interface CompleteOptions {
  model?: string;
  messages: any[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: any[];
  executableTools?: SessionToolDefinition[];
  executableToolsProvider?: () => SessionToolDefinition[];
  maxIterations?: number;
  onTextDelta?: (delta: string) => void | Promise<void>;
  usageContext?: AIUsageContext;
  usageContextTokens?: number;
  usageBreakdown?: AIUsageFinalization["breakdown"];
}

export interface CompleteResponse {
  content: string | null;
  reasoning: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  raw: any;
  turnMessages: any[];
  iterations?: number;
  allToolCalls?: ToolCallRecord[];
}

export interface AIInstance {
  generateText(options: { prompt?: string; messages: TextMessage[]; model?: string; temperature?: number; max_tokens?: number }): Promise<string>;
  generateMultimodal(options: { prompt?: string; messages: MultimodalMessage[]; model?: string; temperature?: number; max_tokens?: number }): Promise<string>;
  complete(options: CompleteOptions): Promise<CompleteResponse>;
  generateWithTools(options: { prompt?: string; messages: TextMessage[] | MultimodalMessage[]; model?: string; temperature?: number; maxIterations?: number }): Promise<any>;
  setUsageContext?(context: AIUsageContext | undefined): void;
  withUsageContext?<T>(context: AIUsageContext | undefined, fn: () => Promise<T>): Promise<T>;
  registerPrompt(name: string, prompt: string): boolean;
  getPrompt(name: string): string | undefined;
  getAllPrompts(): Record<string, string>;
  removePrompt(name: string): boolean;
}

export interface AIService {
  create(options: { name: string; apiUrl: string; apiKey: string; modelType: "text" | "multimodal"; model?: string }): Promise<AIInstance>;
  get(name: string): AIInstance | undefined;
  list(): string[];
  remove(name: string): boolean;
  setDefault(name: string): boolean;
  getDefault(): AIInstance | undefined;
  registerChatRuntime(runtime: any): boolean;
  getChatRuntime(): any;
  removeChatRuntime(): boolean;
  registerSkill(skill: AISkill): boolean;
  getSkill(skillName: string): AISkill | undefined;
  getAllSkills(): Map<string, AISkill>;
  removeSkill(skillName: string): boolean;
  getTool(toolName: string): AITool | undefined;
  getAllTools(): Map<string, AITool>;
  getUsageSummary?(options: { range: AIUsageRange; botId?: number }): AIUsageSummary;
  cleanupUsageStats?(retentionMs?: number): number;
  finalizeUsage?(usageId: string, finalization: AIUsageFinalization): boolean;
}

// ---------- chat runtime ----------

export interface ChatRuntime {
  generateNotice(options: ChatRuntimeNoticeOptions): Promise<ChatRuntimeResult>;
  requestInformation(options: ChatRuntimeInformationRequestOptions): Promise<ChatRuntimeResult>;
}

export const TOOL_RESULT_FOLLOWUP_KEY = "__miokuFollowup";

export interface ToolResultFollowup {
  text: string;
  images?: Array<{ url: string; detail?: "auto" | "low" | "high" }>;
  videos?: Array<{ url: string; detail?: "auto" | "low" | "high" }>;
}

export interface ChatRuntimePromptInjection {
  content: string;
  title?: string;
}

export interface ChatRuntimeGroupTarget {
  selfId: number;
  groupId: number;
}

export interface ChatRuntimePrivateTarget {
  selfId: number;
  userId: number;
}

export type ChatRuntimeSource =
  | { event: any }
  | ChatRuntimeGroupTarget
  | ChatRuntimePrivateTarget;

export type ChatRuntimeBaseOptions = ChatRuntimeSource & {
  targetMessage?: string;
  promptInjections?: ChatRuntimePromptInjection[];
  send?: boolean;
};

export type ChatRuntimeNoticeOptions = ChatRuntimeBaseOptions & {
  instruction: string;
};

export type ChatRuntimeInformationRequestOptions = ChatRuntimeBaseOptions & {
  task: string;
  schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  toolName?: string;
  toolDescription?: string;
};

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
  pendingAt?: number[];
  pendingPoke?: number[];
  pendingQuote?: number;
  emojiPath?: string | null;
  protocolMessages?: any[];
}

// ---------- usage tracking ----------

export type AIUsageRange = "today" | "7d" | "30d";

export type AIUsageScope = "all" | "bot";

export interface AIUsageContext {
  usageId?: string;
  source?: string;
  botId?: number;
  groupId?: number;
  groupName?: string;
  userId?: number;
  userName?: string;
  sessionId?: string;
}

export interface AIUsageBreakdown {
  systemPromptTokens?: number;
  chatHistoryTokens?: number;
  toolDefinitionTokens?: number;
  toolUseTokens?: number;
  otherContextTokens?: number;
}

export interface AIUsageFinalization {
  sentUserMessages?: number;
  sentAssistantMessages?: number;
  breakdown?: AIUsageBreakdown;
}

export interface AIUsageBotOption {
  botId: number;
  label: string;
}

export interface AIUsageSummary {
  generatedAt: number;
  range: AIUsageRange;
  scope: AIUsageScope;
  botId?: number;
  bots: AIUsageBotOption[];
  totals: {
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    toolMessages: number;
    sentUserMessages: number;
    sentAssistantMessages: number;
    inputTokens: number;
    outputTokens: number;
    systemPromptTokens: number;
    totalTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    toolDefinitionTokens: number;
    toolUseTokens: number;
    chatHistoryTokens: number;
    otherContextTokens: number;
    durationMs: number;
    toolCalls: number;
  };
  rates: {
    throughputTokPerMin: number;
    averageTokensPerUserMessage: number;
    averageTokensPerSentMessage: number;
    errorRate: number;
    cacheHitRate: number;
  };
  toolRanking: Array<{ name: string; count: number }>;
  groupRanking: Array<{
    groupId: number;
    groupName: string;
    requests: number;
    totalTokens: number;
    userMessages: number;
    assistantMessages: number;
    errorRate: number;
  }>;
  tokenFlow: Array<{ name: "输入" | "输出" | "缓存写入" | "缓存读取"; value: number }>;
  tokenCategories: Array<{
    name: "系统提示词" | "工具定义" | "工具使用" | "聊天上下文" | "其他上下文";
    value: number;
  }>;
  dailyActivity: Array<{
    day: string;
    requests: number;
    userMessages: number;
    assistantMessages: number;
    totalTokens: number;
    inputTokens: number;
    cacheReadTokens: number;
    throughputTokPerMin: number;
    averageTokensPerUserMessage: number;
    averageTokensPerSentMessage: number;
    errorRate: number;
    cacheHitRate: number;
  }>;
  hourlyActivity: Array<{
    hour: string;
    requests: number;
    userMessages: number;
    assistantMessages: number;
    totalTokens: number;
    inputTokens: number;
    cacheReadTokens: number;
    throughputTokPerMin: number;
    averageTokensPerUserMessage: number;
    averageTokensPerSentMessage: number;
    errorRate: number;
    cacheHitRate: number;
  }>;
}
