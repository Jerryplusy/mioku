import { defineCapability } from '../adapter/capability'
import { toId } from '../adapter'

import type { Bot, MessageInput, PlatformId, SentMessage } from '../adapter'

export interface FriendInfo {
  readonly user_id: string
  readonly nickname?: string
  readonly remark?: string
  readonly [key: string]: unknown
}

export interface FriendGetInfoRequest {
  readonly user_id: PlatformId
}

export interface FriendDeleteRequest {
  readonly user_id: PlatformId
}

export interface FriendGetListRequest {}

export const friendGetInfo = defineCapability<FriendGetInfoRequest, FriendInfo>('friend.getinfo', 1)
export const friendDelete = defineCapability<FriendDeleteRequest, void>('friend.delete', 1)
export const friendGetList = defineCapability<FriendGetListRequest, FriendInfo[]>('friend.getlist', 1)

export interface Friend {
  readonly user_id: string
  readonly nickname?: string
  sendMsg(message: MessageInput): Promise<SentMessage>
  getInfo(): Promise<FriendInfo | null>
  getList(): Promise<FriendInfo[]>
  delete(): Promise<void>
}

export const createFriendRef = (bot: Bot, user_id: PlatformId, nickname?: string): Friend => {
  const uid = toId(user_id)
  return {
    user_id: uid,
    nickname,
    sendMsg: (message) => bot.sendPrivateMsg(uid, message),
    getInfo: () => bot.getFriendInfo(uid),
    getList: () => bot.getFriendList(),
    delete: () => bot.deleteFriend(uid),
  }
}
