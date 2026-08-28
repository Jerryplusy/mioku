import { defineCapability } from '../adapter'
import type { Message, MessageInput, MessageTarget, SentMessage } from '../adapter'

export interface MessageSendRequest {
  readonly target: MessageTarget
  readonly message: MessageInput
}

export interface MessageRecallRequest {
  readonly message_id: string
}

export interface MessageGetRequest {
  readonly message_id: string
}

export interface MessageGetResult {
  readonly message_id: string
  readonly message: Message
  readonly raw_message?: string
  readonly time?: number
  readonly user_id?: string
  readonly [key: string]: unknown
}

export interface ForwardNode {
  readonly user_id?: string
  readonly nickname?: string
  readonly time?: number
  readonly message: Message
}

export interface MessageGetForwardRequest {
  readonly message_id: string
}

export interface ReactionSetRequest {
  readonly message_id: string | number
  readonly emoji_id: string | number
  readonly set?: boolean
}

export interface ForwardSendNode {
  readonly user_id: string
  readonly nickname: string
  readonly content: MessageInput
}

export interface ForwardSendRequest {
  readonly target: MessageTarget
  readonly nodes: readonly ForwardSendNode[]
  readonly source?: string
  readonly news?: ReadonlyArray<{ text: string }>
  readonly summary?: string
}

export const messageSend = defineCapability<MessageSendRequest, SentMessage>('message.send', 1)
export const messageRecall = defineCapability<MessageRecallRequest, void>('message.recall', 1)
export const messageGet = defineCapability<MessageGetRequest, MessageGetResult>('message.get', 1)
export const messageGetForward = defineCapability<MessageGetForwardRequest, ForwardNode[]>('message.getforward', 1)
export const reactionSet = defineCapability<ReactionSetRequest, void>('message.reactionset', 1)
export const forwardSend = defineCapability<ForwardSendRequest, SentMessage>('message.forwardsend', 1)