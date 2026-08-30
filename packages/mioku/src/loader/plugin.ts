import { pathToFileURL } from 'node:url'
import type { Jiti } from 'jiti'

import type { MiokuPlugin } from '../plugin'
import type { PluginCandidate } from './package'
import { resolveEntry, resolveLocalPluginEntry } from './package'

export const isMiokuPlugin = (value: unknown): value is MiokuPlugin => {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<MiokuPlugin>
  return typeof v.name === 'string' && (v.setup === undefined || typeof v.setup === 'function')
}

const loadFromEntry = async (jiti: Jiti, entry: string, name: string): Promise<MiokuPlugin> => {
  const mod = await jiti.import(pathToFileURL(entry).href)
  const exported = (mod as { default?: unknown }).default ?? mod
  if (!isMiokuPlugin(exported)) {
    throw new Error(`Plugin "${name}" does not export a valid MiokuPlugin (need "name" and optional "setup")`)
  }
  if (exported.name !== name) {
    throw new Error(
      `Plugin canonical ID mismatch: manifest="${name}" export="${exported.name}". Ensure plugin.name matches the manifest`,
    )
  }
  return exported
}

export const loadNpmPlugin = async (
  jiti: Jiti,
  candidate: PluginCandidate,
): Promise<MiokuPlugin> => {
  const entry = resolveEntry(candidate.resolvedPath, candidate.packageJson, candidate.entry)
  if (!entry) {
    throw new Error(`Plugin "${candidate.name}" has no resolvable entry point`)
  }
  return await loadFromEntry(jiti, entry, candidate.name)
}

export const loadLocalPlugin = async (
  jiti: Jiti,
  name: string,
  resolvedPath: string,
): Promise<MiokuPlugin> => {
  const entry = resolveLocalPluginEntry(resolvedPath)
  if (!entry) {
    throw new Error(`Local plugin "${name}" has no entry point`)
  }
  return await loadFromEntry(jiti, entry, name)
}