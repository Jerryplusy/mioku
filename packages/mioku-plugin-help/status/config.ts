/**
 * help 插件状态图配置（config-service 注册名为 "help/status"）。
 * 配置文件位于 `<项目>/config/help/status.json`，可热重载。
 */
export interface HelpStatusConfig {
  /**
   * stdin 适配器在状态图中使用的头像。
   * 支持 http(s):// 或 file:// URL，也支持本地绝对路径（自动转换为 file://）。
   * 默认使用 uapis.cn 的随机表情接口。
   */
  stdinAvatar?: string;
}

export const HELP_STATUS_DEFAULT_CONFIG: HelpStatusConfig = {
  // 默认使用 uapis.cn 的二次元表情随机接口（每次刷新头像都不同）
  stdinAvatar: "https://uapis.cn/api/v1/random/image?category=bq&type=eciyuan",
};
