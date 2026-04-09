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
  handler: (args: any, event?: any) => Promise<any> | any;
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
 * 指令权限级别
 */
export type CommandRole = "master" | "admin" | "owner" | "member";

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
    role?: CommandRole;
  }>;
}

/**
 * 插件包配置 (package.json 中的 mioku 字段)
 */
export interface PluginPackageConfig {
  services?: string[]; // 依赖的服务
  help?: PluginHelp; // 帮助信息（运行时来源）
}

/**
 * Mioku 服务定义
 */
export interface MiokuService {
  name: string;
  version: string;
  description?: string;

  // 初始化服务
  init(): Promise<void>;

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
