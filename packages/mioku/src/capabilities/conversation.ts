import { defineCapability } from '../adapter/capability'
import type { MessageTarget, PlatformId } from '../adapter'

/** 历史消息记录 */
export interface HistoryMessage {
  readonly message_id: string
  readonly time?: number
  readonly user_id?: string
  readonly nickname?: string
  readonly message: import('../adapter').Message
}

/** 拉取会话历史消息的请求参数 */
export interface ConversationGetHistoryRequest {
  readonly target: MessageTarget
  /** 从这个消息 id 之前开始取（不含该条） */
  readonly before?: PlatformId
  readonly limit?: number
  /** 适配器私有扩展参数透传 */
  readonly extra?: Record<string, unknown>
}

/** 拉取会话的历史消息 */
export const conversationGetHistory = defineCapability<ConversationGetHistoryRequest, HistoryMessage[]>(
  'conversation.gethistory',
  1,
)
