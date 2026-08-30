import { defineCapability } from '../adapter/capability'
import { toId } from '../adapter'

import type { Bot, MessageInput, PlatformId, SentMessage } from '../adapter'

/** 好友信息 */
export interface FriendInfo {
  readonly user_id: string
  readonly nickname?: string
  readonly remark?: string
  readonly [key: string]: unknown
}

/** 获取好友信息的请求参数 */
export interface FriendGetInfoRequest {
  readonly user_id: PlatformId
}

/** 删除好友的请求参数 */
export interface FriendDeleteRequest {
  readonly user_id: PlatformId
}

/** 获取好友列表的请求参数 */
export interface FriendGetListRequest {}

/** 获取好友信息 */
export const friendGetInfo = defineCapability<FriendGetInfoRequest, FriendInfo>('friend.getinfo', 1)
/** 删除好友 */
export const friendDelete = defineCapability<FriendDeleteRequest, void>('friend.delete', 1)
/** 获取好友列表 */
export const friendGetList = defineCapability<FriendGetListRequest, FriendInfo[]>('friend.getlist', 1)

/** 好友操作句柄：绑定某个好友的快捷操作 */
export interface Friend {
  readonly user_id: string
  readonly nickname?: string
  sendMsg(message: MessageInput): Promise<SentMessage>
  getInfo(): Promise<FriendInfo | null>
  getList(): Promise<FriendInfo[]>
  delete(): Promise<void>
}

/** 为指定好友创建操作句柄 */
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
