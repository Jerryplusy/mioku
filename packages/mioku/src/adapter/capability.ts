/** 能力：一个可被适配器实现、被插件调用的操作契约（如 `message.send`） */
export interface Capability<I, O> {
  readonly name: string
  readonly version: number
  /** 能力唯一标识，同名同版本的实现只能注册一份 */
  readonly token: symbol
}

/** 定义一个能力，`I` 为请求类型，`O` 为返回类型 */
export const defineCapability = <I, O>(name: string, version: number = 1): Capability<I, O> => {
  if (name.length === 0) {
    throw new Error('defineCapability: name must be a non-empty string')
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('defineCapability: version must be a positive integer')
  }
  return { name, version, token: Symbol(name) }
}

/** 目标上没有注册该能力时抛出的错误 */
export class UnsupportedCapabilityError extends Error {
  readonly capability: string
  constructor(capability: string) {
    super(`Capability "${capability}" is not supported on this target`)
    this.name = 'UnsupportedCapabilityError'
    this.capability = capability
  }
}
