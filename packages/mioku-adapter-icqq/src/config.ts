import { Platform, type Config } from "mioku-adapter-icqq/vendor/icqq";

export interface IcqqAdapterConfig {
  instances: ReadonlyArray<IcqqInstanceConfig>;
}

export interface IcqqInstanceConfig {
  uin: number;
  password?: string | Buffer;
  /** icqq 协议版本，例如 9.2.90. */
  ver?: string;
  /** qsign 的 /sign 地址，通常需要带 ?key=... */
  sign_api_addr?: string;
  /** 登录设备类型：apad / aphone / awatch / ipad / imac（默认 aphone） */
  platform?: string;
  /** 是否忽略自己账号发送的消息（默认 true，不会收到自己发的消息事件） */
  ignore_self?: boolean;
  config?: Config;
}

/** 支持的登录设备类型（icqq Platform 的字符串别名） */
export const PLATFORM_OPTIONS = [
  "apad",
  "aphone",
  "awatch",
  "ipad",
  "imac",
] as const;

const PLATFORM_MAP: Record<string, Platform> = {
  aphone: Platform.Android,
  apad: Platform.aPad,
  awatch: Platform.Watch,
  imac: Platform.iMac,
  ipad: Platform.iPad,
  custom: Platform.Custom,
};

/** 登录设备的展示名（Platform 枚举里 Android 实际是 aPhone 协议） */
const PLATFORM_LABELS: Record<number, string> = {
  [Platform.Android]: "aPhone",
  [Platform.aPad]: "aPad",
  [Platform.Watch]: "Watch",
  [Platform.iMac]: "iMac",
  [Platform.iPad]: "iPad",
  [Platform.Tim]: "Tim",
};

export const platformLabel = (platform: unknown): string | undefined =>
  typeof platform === "number" ? PLATFORM_LABELS[platform] : undefined;

/** 解析登录设备类型，非法输入回退到 fallback（默认 aphone） */
export const normalizePlatform = (
  input: unknown,
  fallback: Platform = Platform.Android,
): Platform => {
  if (
    typeof input === "number" &&
    Number.isInteger(input) &&
    input >= 1 &&
    input <= 7
  )
    return input as Platform;
  if (typeof input === "string") {
    const value =
      PLATFORM_MAP[input.trim().toLowerCase() as keyof typeof PLATFORM_MAP];
    if (value != null) return value;
  }
  return fallback;
};

export const normalizeInstances = (input: unknown): IcqqInstanceConfig[] => {
  if (Array.isArray(input)) return input.filter(isInstance);
  if (typeof input === "object" && input !== null) {
    const value = input as Record<string, unknown>;
    if (Array.isArray(value.instances))
      return value.instances.filter(isInstance);
    if (isInstance(value)) return [value];
  }
  return [];
};

const isInstance = (value: unknown): value is IcqqInstanceConfig =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { uin?: unknown }).uin === "number";
