/** 一条已建立的 WebSocket 连接 */
export interface WebSocketConnection {
  readonly id: string
  readonly url: string
  readonly readyState: 'connecting' | 'open' | 'closing' | 'closed'

  send(data: string | Uint8Array): Promise<void>
  close(code?: number, reason?: string): Promise<void>

  /** 监听消息，返回取消监听的函数 */
  onMessage(handler: (data: string | Uint8Array) => void): () => void
  /** 监听连接关闭，返回取消监听的函数 */
  onClose(handler: (event: { code: number; reason: string }) => void): () => void
  /** 监听连接错误，返回取消监听的函数 */
  onError(handler: (err: Error) => void): () => void
}

/** 建立 WebSocket 连接的选项 */
export interface WebSocketConnectOptions {
  readonly headers?: Readonly<Record<string, string>>
  readonly protocols?: readonly string[]
  readonly signal?: AbortSignal
  /** 连接超时时间（毫秒） */
  readonly connectTimeout?: number
}

/** WebSocket 客户端 */
export interface WebSocketClient {
  connect(url: string, options?: WebSocketConnectOptions): Promise<WebSocketConnection>
}

/** HTTP 请求参数 */
export interface HttpRequestOptions {
  readonly method: string
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  /** 请求体：字符串、二进制或对象（对象按 JSON 发送） */
  readonly body?: string | Uint8Array | Readonly<Record<string, unknown>>
  /** 超时时间（毫秒） */
  readonly timeout?: number
  readonly signal?: AbortSignal
}

/** HTTP 响应 */
export interface HttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Uint8Array
  text(): string
  json<T = unknown>(): T
  arrayBuffer(): ArrayBuffer
}

/** HTTP 客户端 */
export interface HttpClient {
  request(options: HttpRequestOptions): Promise<HttpResponse>
}

/** 驱动：为适配器提供统一的 HTTP 与 WebSocket 能力 */
export interface Driver {
  readonly name: string
  readonly http: HttpClient
  readonly websocket: WebSocketClient
  /** 关闭驱动：中止进行中的请求并断开所有连接 */
  shutdown(): Promise<void>
}

/** 驱动已关闭后发起请求时抛出的错误 */
export class DriverShutdownError extends Error {
  constructor(message = 'Driver has been shut down') {
    super(message)
    this.name = 'DriverShutdownError'
  }
}

/** WebSocket 连接超时时抛出的错误 */
export class WebSocketConnectTimeoutError extends Error {
  constructor(url: string, timeout: number) {
    super(`WebSocket connect timed out after ${timeout}ms: ${url}`)
    this.name = 'WebSocketConnectTimeoutError'
  }
}

/** HTTP 请求失败时抛出的错误 */
export class HttpRequestError extends Error {
  /** HTTP 状态码，网络错误或超时时为 0 */
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpRequestError'
    this.status = status
  }
}