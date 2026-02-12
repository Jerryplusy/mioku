import type { MiokiContext } from "mioki";

/**
 * AI 工具定义
 */
export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<any> | any;
  returnToAI?: boolean; // 是否将工具结果返回给 AI 继续处理
}

/**
 * AI Skill 定义 (一个插件对应一个 skill)
 */
export interface AISkill {
  name: string; // skill 名称，通常与插件名相同
  description: string;
  tools: AITool[]; // skill 下的工具列表
}

/**
 * 插件帮助信息
 */
export interface PluginHelp {
  title: string;
  description: string;
  commands: Array<{
    cmd: string;
    desc: string;
    usage?: string;
  }>;
}

/**
 * 插件包配置 (package.json 中的 mioku 字段)
 */
export interface PluginPackageConfig {
  services?: string[]; // 依赖的服务
  skill?: {
    // skill 配置
    name?: string; // skill 名称，默认为插件名
    description?: string; // skill 描述
  };
  commands?: string[]; // 注册的命令
  help?: PluginHelp; // 帮助信息
}

/**
 * Mioku 插件扩展属性
 * 这些属性会被添加到 mioki 的 MiokiPlugin 上
 */
export interface MiokuPluginExtension {
  // 依赖的服务
  services?: string[];

  // 提供的 AI Skill (包含多个工具)
  skill?: AISkill;

  // 帮助信息
  help?: PluginHelp;
}

/**
 * Mioku 插件定义
 * 扩展 mioki 的 MiokiPlugin，添加我们的自定义字段
 */
export interface MiokuPlugin extends MiokuPluginExtension {
  name: string;
  version?: string;
  description?: string;
  priority?: number;
  dependencies?: string[];
  setup?: (ctx: MiokiContext) => any;
}

/**
 * Mioku 服务定义
 */
export interface MiokuService {
  name: string;
  version: string;
  description?: string;

  // 初始化服务
  init(ctx: MiokiContext): Promise<void>;

  // 提供的 API
  api: Record<string, any>;

  // 清理资源
  dispose?(): Promise<void>;
}

/**
 * 插件元数据
 */
export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  path: string;
  packageJson: any;
  config: PluginPackageConfig;
}

/**
 * 服务元数据
 */
export interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  path: string;
  packageJson: any;
}
