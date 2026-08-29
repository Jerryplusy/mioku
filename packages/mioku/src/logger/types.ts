/** 日志级别，从 silent 到 trace 逐渐详细 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'log' | 'info' | 'debug' | 'trace'

/** 日志器接口：按级别输出，可派生带标签或作用域的子 logger */
export interface Logger {
  readonly level: LogLevel
  error(...args: unknown[]): void
  warn(...args: unknown[]): void
  log(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  trace(...args: unknown[]): void
  withTag(tag: string): Logger
  child(scope: Record<string, unknown>): Logger
}

export const LOG_LEVELS: readonly LogLevel[] = ['silent', 'error', 'warn', 'log', 'info', 'debug', 'trace']

/** 级别的数字优先级，数值越大越详细 */
export const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  silent: -1,
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

export const LOG_LEVEL_NUMERIC: Readonly<Record<LogLevel, number>> = {
  silent: -1,
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

/** 判断一个值是否为合法的日志级别 */
export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)

/** 日志模块抛出的错误 */
export class LoggerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoggerError'
  }
}