import { defineCapability } from '../adapter/capability'

/** 修改 bot 自身资料的请求参数 */
export interface ProfileSetRequest {
  readonly nickname?: string
  /** 个性签名 */
  readonly personal_note?: string
  /** 性别编码，具体取值由适配器定义 */
  readonly sex?: number
  readonly [key: string]: unknown
}

/** 设置 bot 头像的请求参数 */
export interface AvatarSetRequest {
  /** 图片 URL 或本地路径 */
  readonly file: string
}

/** 修改 bot 自身资料 */
export const profileSet = defineCapability<ProfileSetRequest, void>('profile.set', 1)
/** 设置 bot 头像 */
export const avatarSet = defineCapability<AvatarSetRequest, void>('profile.setavatar', 1)
/** 获取 bot 头像,返回头像地址;平台无法提供时返回 null */
export const avatarGet = defineCapability<Record<string, never>, string | null>('profile.getavatar', 1)