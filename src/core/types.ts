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
  handler: (args: any, event?: any) => Promise<any> | any; //处理逻辑
}

/**
 * AI Skill 定义
 */
export interface AISkill {
  name: string;
  description: string;
  tools: AITool[]; // skill 下的工具列表
}

/**
 * 指令权限级别
 */
export type CommandRole = "master" | "admin" | "owner" | "member"; // 主人 管理员 群主 群成员

/**
 * 插件帮助信息
 */
export interface PluginHelp {
  title: string; // 插件名称
  description: string; // 描述
  commands: Array<{
    cmd: string; // 命令
    desc: string; // 命令描述
    usage?: string; // 使用示例
    role?: CommandRole; // 使用权限
  }>;
}

/**
 * 插件包配置
 * package.json 中的 mioku 字段
 */
export interface PluginPackageConfig {
  services?: string[]; // 依赖的服务
  help?: PluginHelp; // 帮助信息
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

  // 服务提供的 API
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
  path: string; // 插件路径
  packageJson: any; // 插件 package
  config: PluginPackageConfig; // 插件 Mioku 配置项
}

/**
 * 服务元数据
 */
export interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  path: string; // 服务路径
  packageJson: any; // 服务 package
}
