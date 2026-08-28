import { defineCapability } from '../adapter'
import type { MessageTarget } from '../adapter'

export interface HistoryMessage {
  readonly message_id: string
  readonly time?: number
  readonly message: import('../adapter').Message
}

export interface ConversationGetHistoryRequest {
  readonly target: MessageTarget
  /** 从这个消息 id 之前开始取（不含该条） */
  readonly before?: string
  readonly limit?: number
  /** 适配器私有扩展参数透传 */
  readonly extra?: Record<string, unknown>
}

export const conversationGetHistory = defineCapability<ConversationGetHistoryRequest, HistoryMessage[]>(
  'conversation.gethistory',
  1,
)
