/**
 * 适配器上报的实例计数：只报事实，展示文案与排版由 core 决定。
 * 缺省的字段表示该平台没有这个概念或暂时取不到。
 */
export interface AdapterStatusStats {
  /** 好友 / 私聊联系人数 */
  readonly friends?: number
  /** 群 / 频道数 */
  readonly groups?: number
  /** 已发送消息数 */
  readonly sent?: number
  /** 已接收消息数 */
  readonly received?: number
}

/**
 * 适配器状态上报。
 * 带 `bot_id` 表示这是某个具体实例的状态，缺省则视为整个适配器的状态。
 */
export interface AdapterStatus {
  readonly adapter: string
  readonly bot_id?: string
  /** 实现名称，如 NapCat / Lagrange，由平台自报 */
  readonly impl?: string
  /** 实现版本，如 OneBot 实现端的 app_version */
  readonly version?: string
  readonly stats?: AdapterStatusStats
  /** 原始数据，仅供插件读取，core 不展示 */
  readonly data: Readonly<Record<string, unknown>>
}
