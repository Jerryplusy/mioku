import { defineCapability } from '../adapter/capability'
import { toId } from '../adapter'

import type { PlatformId, Bot, MessageInput, SentMessage } from '../adapter'
import type { MemberInfo } from './member'

/** 群信息 */
export interface GroupInfo {
  readonly group_id: string
  readonly group_name?: string
  readonly member_count?: number
  readonly max_member_count?: number
  readonly [key: string]: unknown
}

/** 获取群信息的请求参数 */
export interface GroupGetInfoRequest {
  readonly group_id: PlatformId
}

/** 获取群成员列表的请求参数 */
export interface GroupGetMembersRequest {
  readonly group_id: PlatformId
}

/** 退出群聊的请求参数 */
export interface GroupLeaveRequest {
  readonly group_id: PlatformId
  /** 是否解散群 */
  readonly is_dismiss?: boolean
}

/** 修改群名的请求参数 */
export interface GroupSetNameRequest {
  readonly group_id: PlatformId
  readonly group_name: string
}

/** 设置群头像的请求参数 */
export interface GroupSetPortraitRequest {
  readonly group_id: PlatformId
  /** 图片 URL 或本地路径 */
  readonly file: string
}

/** 全员禁言的请求参数 */
export interface GroupSetWholeBanRequest {
  readonly group_id: PlatformId
  readonly enable: boolean
}

/** 获取群列表的请求参数 */
export interface GroupGetListRequest {}

/** 获取群信息 */
export const groupGetInfo = defineCapability<GroupGetInfoRequest, GroupInfo>('group.getinfo', 1)
/** 获取群成员列表 */
export const groupGetMembers = defineCapability<GroupGetMembersRequest, MemberInfo[]>('group.getmembers', 1)
/** 退出群聊 */
export const groupLeave = defineCapability<GroupLeaveRequest, void>('group.leave', 1)
/** 修改群名 */
export const groupSetName = defineCapability<GroupSetNameRequest, void>('group.setname', 1)
/** 全员禁言 */
export const groupSetWholeBan = defineCapability<GroupSetWholeBanRequest, void>('group.setwholeban', 1)
/** 设置群头像 */
export const groupSetPortrait = defineCapability<GroupSetPortraitRequest, void>('group.setportrait', 1)
/** 获取群列表 */
export const groupGetList = defineCapability<GroupGetListRequest, GroupInfo[]>('group.getlist', 1)

/** 群操作句柄：绑定某个群的快捷操作 */
export interface Group {
  readonly group_id: string
  readonly group_name?: string
  sendMsg(message: MessageInput): Promise<SentMessage>
  getInfo(): Promise<GroupInfo | null>
  getList(): Promise<GroupInfo[]>
  getMemberList(): Promise<MemberInfo[]>
  getMemberInfo(userId: PlatformId): Promise<MemberInfo | null>
  /** 禁言成员，duration 单位为秒，0 表示解除 */
  ban(userId: PlatformId, duration: number): Promise<void>
  kick(userId: PlatformId, rejectAddRequest?: boolean): Promise<void>
  setCard(userId: PlatformId, card: string): Promise<void>
  setAdmin(userId: PlatformId, enable: boolean): Promise<void>
  recall(messageId: PlatformId): Promise<void>
  /** 退出群聊，isDismiss 为 true 时解散群 */
  leave(isDismiss?: boolean): Promise<void>
  setName(groupName: string): Promise<void>
  setPortrait(file: string): Promise<void>
}

/** 为指定群创建操作句柄 */
export const createGroupRef = (bot: Bot, group_id: PlatformId, group_name?: string): Group => {
  const gid = toId(group_id)
  return {
    group_id: gid,
    group_name,
    sendMsg: (message) => bot.sendGroupMsg(gid, message),
    getInfo: () => bot.getGroupInfo(gid),
    getList: () => bot.getGroupList(),
    getMemberList: () => bot.getGroupMembers(gid),
    getMemberInfo: (userId) => bot.getMemberInfo(gid, userId),
    ban: (userId, duration) => bot.banMember(gid, userId, duration),
    kick: (userId, rejectAddRequest) => bot.kickMember(gid, userId, rejectAddRequest),
    setCard: (userId, card) => bot.setMemberCard(gid, userId, card),
    setAdmin: (userId, enable) => bot.setMemberAdmin(gid, userId, enable),
    recall: (messageId) => bot.recallMessage(messageId),
    leave: (isDismiss) => bot.leaveGroup(gid, isDismiss),
    setName: (groupName) => bot.setGroupName(gid, groupName),
    setPortrait: (file) => bot.setGroupPortrait(gid, file),
  }
}
