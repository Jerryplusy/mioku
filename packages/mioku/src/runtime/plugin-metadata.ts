import { getOrCreate } from '../internal/registry'

import type { PluginMetadata } from '../types'

const store = getOrCreate<Map<string, PluginMetadata>>('plugin-metadata', () => new Map())

export const setPluginMetadata = (meta: PluginMetadata): void => {
  store.set(meta.name, meta)
}

export const removePluginMetadata = (name: string): void => {
  store.delete(name)
}

export const getPluginMetadata = (name: string): PluginMetadata | undefined => store.get(name)

export const getPluginMetadataList = (): PluginMetadata[] => [...store.values()]

export const resetPluginMetadata = (): void => {
  store.clear()
}