import { defineCapability } from '../adapter/capability'

export interface ProfileSetRequest {
  readonly nickname?: string
  readonly personal_note?: string
  readonly sex?: number
  readonly [key: string]: unknown
}

export interface AvatarSetRequest {
  readonly file: string
}

export const profileSet = defineCapability<ProfileSetRequest, void>('profile.set', 1)
export const avatarSet = defineCapability<AvatarSetRequest, void>('profile.setavatar', 1)