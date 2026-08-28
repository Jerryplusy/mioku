import core from './core'

import type { MiokuPlugin } from '../plugin'

export const BUILTIN_PLUGINS: readonly MiokuPlugin[] = [core]

export * from './core'
