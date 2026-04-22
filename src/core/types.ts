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
  //处理逻辑
  handler: (args: any, event?: any) => Promise<any> | any;
}

/**
 * AI Skill 定义
 */
export interface AISkill {
  name: string;
  description: string;
  // skill 权限，默认 member
  permission?: SkillPermissionRole;
  // skill 下的工具列表
  tools: AITool[];
}

/**
 * AI Skill 权限级别
 * owner: mioki 主人
 * admin: mioki 管理 + 群管 + 群主
 * member: 普通成员
 */
export type SkillPermissionRole = "owner" | "admin" | "member";

/**
 * 指令权限级别
 * 主人 管理员 群主 群成员
 */
export type CommandRole = "master" | "admin" | "owner" | "member";

/**
 * 插件帮助信息
 */
export interface PluginHelp {
  // 插件名称
  title: string;
  // 描述
  description: string;
  commands: Array<{
    // 命令
    cmd: string;
    // 命令描述
    desc: string;
    // 使用示例
    usage?: string;
    // 使用权限
    role?: CommandRole;
  }>;
}

/**
 * 插件包配置
 * package.json 中的 mioku 字段
 */
export interface PluginPackageConfig {
  // 依赖的服务
  services?: string[];
  // 帮助信息
  help?: PluginHelp;
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
  // 插件路径
  path: string;
  // 插件 package
  packageJson: any;
  // 插件 Mioku 配置项
  config: PluginPackageConfig;
}

/**
 * 服务元数据
 */
export interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  // 服务路径
  path: string;
  // 服务 package
  packageJson: any;
}
