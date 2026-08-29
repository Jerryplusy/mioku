import { defineCapability } from '../adapter/capability'
import type { PlatformId } from '../adapter'

/** 群成员信息 */
export interface MemberInfo {
  readonly user_id: string
  readonly nickname?: string
  /** 群名片 */
  readonly card?: string
  readonly role?: 'owner' | 'admin' | 'member' | (string & {})
  /** 入群时间 */
  readonly join_time?: number
  /** 最后一次发言时间 */
  readonly last_sent_time?: number
  readonly [key: string]: unknown
}

/** 禁言成员的请求参数 */
export interface MemberBanRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
  /** 禁言时长（秒），0 = 解除禁言 */
  readonly duration: number
}

/** 将成员移出群聊的请求参数 */
export interface MemberKickRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
  /** 是否拒绝该成员后续的加群申请 */
  readonly reject_add_request?: boolean
}

/** 设置成员群名片的请求参数 */
export interface MemberSetCardRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
  readonly card: string
}

/** 设置或取消群管理员的请求参数 */
export interface MemberSetAdminRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
  readonly enable: boolean
}

/** 查询群成员信息的请求参数 */
export interface MemberGetInfoRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
}

/** 戳一戳群成员的请求参数 */
export interface MemberPokeRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
}

/** 设置成员专属头衔的请求参数 */
export interface MemberSetTitleRequest {
  readonly group_id: PlatformId
  readonly user_id: PlatformId
  readonly title: string
}

/** 禁言群成员 */
export const memberBan = defineCapability<MemberBanRequest, void>('member.ban', 1)
/** 将成员移出群聊 */
export const memberKick = defineCapability<MemberKickRequest, void>('member.kick', 1)
/** 设置成员群名片 */
export const memberSetCard = defineCapability<MemberSetCardRequest, void>('member.setcard', 1)
/** 设置或取消管理员 */
export const memberSetAdmin = defineCapability<MemberSetAdminRequest, void>('member.setadmin', 1)
/** 获取群成员信息 */
export const memberGetInfo = defineCapability<MemberGetInfoRequest, MemberInfo>('member.getinfo', 1)
/** 戳一戳群成员 */
export const memberPoke = defineCapability<MemberPokeRequest, void>('member.poke', 1)
/** 设置成员专属头衔 */
export const memberSetTitle = defineCapability<MemberSetTitleRequest, void>('member.settitle', 1)
