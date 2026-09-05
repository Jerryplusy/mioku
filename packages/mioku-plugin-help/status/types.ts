/**
 * Status panel data types.
 *
 * The status panel is rendered from a single `StatusSnapshot` aggregated by
 * `data-collector.ts`. Every field is plain data; rendering logic lives in
 * `html-generator.ts`.
 */

export interface BotAccountStatus {
  /** 平台账号标识。QQ 机器人是数字字符串，stdin 等本地适配器是 "stdin"。 */
  uin: string;
  nickname: string;
  avatarUrl: string;
  /** 适配器名，如 "stdin" / "onebotv11" / "icqq"。 */
  adapter: string;
  /** 协议端与版本的可展示文案，如 "ICQQ v1.12.3" / "LLOneBot/7.12.4"，取不到时为空串 */
  implLabel: string;
  /** 实现端名称，如 "NapCat" / "LLOneBot" / "ICQQ"，取不到时为空串 */
  framework: string;
  /** 实现端版本，如 "5.0.6"*/
  appVersion: string;
  /** 协议版本，如 OneBot 的 "v11"，没有则为空串 */
  protocolVersion: string;
  /** 登录设备，如 icqq 的 "aPad"，没有则为空串 */
  platform: string;
  /** 登录设备对应的客户端版本，如 "9.3.50.40225"，没有则为空串 */
  platformVersion: string;
  online: boolean;
  groupCount: number;
  friendCount: number;
  send: number;
  receive: number;
}

/** Subset of mioku's `AIService.getUsageSummary` payload that we actually render. */
export interface AIUsageSummary {
  totals?: {
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  rates?: {
    errorRate?: number;
    cacheHitRate?: number;
  };
  groupRanking?: Array<{
    groupId?: number | string;
    groupName?: string;
    requests?: number;
    totalTokens?: number;
  }>;
  toolRanking?: Array<{
    name?: string;
    count?: number;
  }>;
}

/** Subset of `systeminformation.graphics()` payload that we actually render. */
export interface GraphicsData {
  controllers?: Array<{
    model?: string;
    vendor?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface FrameworkStatus {
  miokuVersion: string;
  miokiVersion: string;
  napcatVersion: string;
  /** Total discovered plugins (enabled + disabled). */
  pluginCount: number;
  /** Currently enabled plugins. */
  pluginEnabled: number;
  /** Number of distinct bot frameworks (deduplicated by app_name). */
  adapterCount: number;
  onlineBotCount: number;
  uptimeMs: number;
  /** Detected JS runtime name: "Bun" / "Node" / "Deno". */
  runtime: string;
  /** Detected JS runtime version. */
  runtimeVersion: string;
}

export interface ResourceStatus {
  cpuPercent: number;
  cpuModel: string;
  /** CPU brand truncated to ~22 chars with ellipsis. */
  cpuModelShort: string;
  /** Human-readable clock, e.g. "2.9 GHz" / "900 MHz". */
  cpuSpeedGHz: string;
  cpuCores: number;
  memPercent: number;
  memUsedGB: number;
  memTotalGB: number;
  /** Buffers + cache as reported by `systeminformation.mem().buffcache`. 0 if unavailable. */
  memBuffCacheGB: number;
  /** 0..100, or 0 if no swap configured. */
  swapPercent: number;
  swapUsedGB: number;
  swapTotalGB: number;
}

export interface NodeRuntimeStatus {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  eventLoopDelayMs: { mean: number; p99: number };
  /** null when `--expose-gc` is not enabled. */
  gc: {
    available: boolean;
    count: number;
    lastDurationMs?: number;
  } | null;
}

export interface NetworkSample {
  ts: number;
  rxBps: number;
  txBps: number;
}

export interface NetworkStatus {
  rxBps: number;
  txBps: number;
  rxTotalBytes: number;
  txTotalBytes: number;
  /** Last 30 minutes of samples, oldest first. */
  history: NetworkSample[];
}

export interface DiskEntry {
  mount: string;
  usedGB: number;
  totalGB: number;
  percent: number;
}

export interface DiskStatus {
  entries: DiskEntry[];
  readMBps?: number;
  writeMBps?: number;
  iops?: number;
}

/** One GPU as reported by `systeminformation.graphics().controllers`. */
export interface GpuInfo {
  vendor: string;
  model: string;
  /** VRAM in GB. 0 if unknown / integrated. */
  vramGB: number;
}

/** One physical memory module as reported by `systeminformation.memLayout()`. */
export interface MemoryStick {
  bank: string;
  sizeGB: number;
  /** "DDR4" / "DDR5" / "LPDDR5" / "Unknown". */
  type: string;
  /** Transfer rate in MT/s, e.g. 3200 / 4800. 0 if unknown. */
  speedMTs: number;
  manufacturer: string;
  partNum: string;
}

/** BIOS / UEFI firmware info from `systeminformation.bios()`. */
export interface BiosInfo {
  vendor: string;
  version: string;
  releaseDate: string;
}

/** One physical disk drive from `systeminformation.diskLayout()`. */
export interface DiskInfo {
  vendor: string;
  name: string;
  /** "HDD" / "SSD" / "NVMe" / unknown. */
  type: string;
  /** "SATA" / "NVMe" / "USB" / unknown. */
  interfaceType: string;
  sizeGB: number;
}

export interface SystemInfo {
  /** "macOS Sequoia 15.5 (arm64)" / "Ubuntu 24.04 LTS (x86_64)". */
  os: string;
  /** Kernel string, e.g. "Darwin 25.5.0" / "Linux 6.8.0-31-generic". */
  kernel: string;
  /** Full CPU brand from `systeminformation.cpu().brand`. */
  cpu: string;
  /** All GPUs detected, integrated + discrete. Empty if none. */
  gpus: GpuInfo[];
  /** All physical RAM modules. Empty if `memLayout()` not supported (e.g. macOS). */
  memSticks: MemoryStick[];
  /** BIOS / UEFI. vendor "N/A" if not supported. */
  bios: BiosInfo;
  /** System manufacturer + model, e.g. "Supermicro H12SSL-NT". "N/A" on macOS. */
  chassis: string;
  /** All physical disk drives. Empty on systems where `diskLayout()` is
   * not supported (rare) or no drives are detected. */
  disks: DiskInfo[];
}

export interface AIUsageStatsLite {
  available: boolean;
  totalRequests: number;
  errorRate: number;
  cacheHitRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  topGroups: Array<{ name: string; requests: number; totalTokens: number }>;
  topTools: Array<{ name: string; count: number }>;
}

export interface StatusSnapshot {
  generatedAt: number;
  isNightMode: boolean;
  bots: BotAccountStatus[];
  framework: FrameworkStatus;
  resources: ResourceStatus;
  runtime: NodeRuntimeStatus;
  network: NetworkStatus;
  disk: DiskStatus;
  system: SystemInfo;
  ai: AIUsageStatsLite;
}

/** Intent returned by `resolveStatusIntent`. Only "full" or "none" — the panel
 * always renders the complete status; sub-section shortcuts were removed. */
export interface StatusIntentFull {
  type: "full";
}

export interface StatusIntentNone {
  type: "none";
}

export type StatusIntent = StatusIntentFull | StatusIntentNone;
