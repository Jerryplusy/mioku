export { stdinAdapterDefinition } from './adapter'
export * from './bot'
export * from './config'
export { stdinAdapterDefinition as default } from './adapter'

declare module 'mioku' {
  interface AdapterBotMap {
    stdin: import('./bot').StdinBot
  }
}
