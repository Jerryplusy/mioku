import { defineCapability } from '../adapter/capability'
import type { Message, MessageInput, MessageTarget, PlatformId, SentMessage } from '../adapter'

/** 发送消息的请求参数 */
export interface MessageSendRequest {
  readonly target: MessageTarget
  readonly message: MessageInput
}

/** 撤回消息的请求参数 */
export interface MessageRecallRequest {
  readonly message_id: PlatformId
}

/** 获取单条消息的请求参数 */
export interface MessageGetRequest {
  readonly message_id: PlatformId
}

/** 获取到的消息详情 */
export interface MessageGetResult {
  readonly message_id: string
  readonly message: Message
  readonly raw_message?: string
  readonly time?: number
  readonly user_id?: string
  readonly [key: string]: unknown
}

/** 合并转发消息里的一条子消息 */
export interface ForwardNode {
  readonly user_id?: string
  readonly nickname?: string
  readonly time?: number
  readonly message: Message
}

/** 获取合并转发消息内容的请求参数 */
export interface MessageGetForwardRequest {
  readonly message_id: PlatformId
}

/** 构造合并转发消息的单个节点 */
export interface ForwardSendNode {
  readonly user_id: PlatformId
  readonly nickname: string
  readonly content: MessageInput
}

/** 合并转发消息的外显样式 */
export interface ForwardSendOptions {
  /** 卡片来源显示文本 */
  readonly source?: string
  /** 卡片外显的摘要条目 */
  readonly news?: ReadonlyArray<{ text: string }>
  /** 卡片底部的总摘要 */
  readonly summary?: string
}

/** 发送合并转发消息的请求参数 */
export interface ForwardSendRequest extends ForwardSendOptions {
  readonly target: MessageTarget
  readonly nodes: readonly ForwardSendNode[]
}

/** 发送消息 */
export const messageSend = defineCapability<MessageSendRequest, SentMessage>('message.send', 1)
/** 撤回消息 */
export const messageRecall = defineCapability<MessageRecallRequest, void>('message.recall', 1)
/** 获取单条消息 */
export const messageGet = defineCapability<MessageGetRequest, MessageGetResult>('message.get', 1)
/** 获取合并转发消息的内容 */
export const messageGetForward = defineCapability<MessageGetForwardRequest, ForwardNode[]>('message.getforward', 1)
/** 发送合并转发消息 */
export const forwardSend = defineCapability<ForwardSendRequest, SentMessage>('message.forwardsend', 1)