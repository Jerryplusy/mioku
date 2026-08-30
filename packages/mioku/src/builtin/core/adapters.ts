import { getOrCreate } from "../../internal/registry";
import { localNum, prettyMs } from "../../utils";

import type { Bot } from "../../adapter";
import type { AdapterStatus, AdapterStatusStats } from "../../runtime/types";

export type { AdapterStatus, AdapterStatusStats } from "../../runtime/types";

export interface StatusProviderContext {
  readonly bot: Bot;
}

export type StatusProvider = (
  context: StatusProviderContext,
) => Promise<AdapterStatus> | AdapterStatus;

/** 注册目标*/
export type StatusProviderTarget =
  | string
  | { readonly adapter: string; readonly bot_id?: string };

const statusProviders = getOrCreate<Map<string, StatusProvider>>(
  "status-providers",
  () => new Map(),
);

const providerKey = (adapter: string, bot_id?: string): string =>
  bot_id == null || bot_id === "" ? adapter : `${adapter}:${bot_id}`;

/**
 * 注册适配器状态上报
 */
export const registerStatusProvider = (
  target: StatusProviderTarget,
  provider: StatusProvider,
): (() => void) => {
  const { adapter, bot_id } =
    typeof target === "string"
      ? { adapter: target, bot_id: undefined }
      : target;
  const key = providerKey(adapter, bot_id);
  statusProviders.set(key, provider);
  return () => {
    if (statusProviders.get(key) === provider) statusProviders.delete(key);
  };
};

const resolveProvider = (bot: Bot): StatusProvider | undefined =>
  statusProviders.get(providerKey(bot.adapter, bot.bot_id)) ??
  statusProviders.get(providerKey(bot.adapter));

/** 单个已连接实例 */
export interface AdapterInstanceStatus {
  readonly bot_id: string;
  readonly nickname: string;
  readonly online: boolean;
  readonly connected_at?: number;
  readonly impl?: string;
  readonly version?: string;
  readonly stats: AdapterStatusStats;
  readonly data: Readonly<Record<string, unknown>>;
}

/** 单个适配器及其实例 */
export interface AdapterReportEntry {
  readonly name: string;
  /** 适配器包版本 */
  readonly version?: string;
  readonly loaded: boolean;
  readonly instances: readonly AdapterInstanceStatus[];
}

export interface AdapterReport {
  readonly adapters: readonly AdapterReportEntry[];
  readonly totalInstances: number;
}

export interface BuildAdapterReportOptions {
  readonly bots: readonly Bot[];
  readonly adapters: readonly {
    readonly name: string;
    readonly version?: string;
  }[];
}

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** v1.0 的适配器把计数塞在 data 里 */
const legacyStats = (data: Record<string, unknown>): AdapterStatusStats => ({
  friends: num(data.friends),
  groups: num(data.groups),
  sent: num(data.send),
  received: num(data.receive),
});

const normalizeStats = (
  stats: AdapterStatusStats | undefined,
  data: Record<string, unknown>,
): AdapterStatusStats => {
  const fallback = legacyStats(data);
  return {
    friends: num(stats?.friends) ?? fallback.friends,
    groups: num(stats?.groups) ?? fallback.groups,
    sent: num(stats?.sent) ?? fallback.sent,
    received: num(stats?.received) ?? fallback.received,
  };
};

const toInstance = (
  bot: Bot,
  status: AdapterStatus | null,
): AdapterInstanceStatus => {
  const data = (status?.data ?? {}) as Record<string, unknown>;
  return {
    bot_id: bot.bot_id,
    nickname: bot.nickname ?? "",
    online: bot.online,
    connected_at: bot.connected_at,
    impl: status?.impl,
    version: status?.version,
    stats: normalizeStats(status?.stats, data),
    data,
  };
};

/** 逐个 bot 查询状态 */
export const buildAdapterReport = async (
  options: BuildAdapterReportOptions,
): Promise<AdapterReport> => {
  const names = options.adapters.map((adapter) => adapter.name);
  for (const bot of options.bots)
    if (!names.includes(bot.adapter)) names.push(bot.adapter);

  const instances = await Promise.all(
    options.bots.map(async (bot) => {
      const provider = resolveProvider(bot);
      if (!provider) return toInstance(bot, null);
      try {
        return toInstance(bot, await provider({ bot }));
      } catch {
        return toInstance(bot, null);
      }
    }),
  );

  const paired = options.bots.map((bot, index) => ({
    adapter: bot.adapter,
    instance: instances[index]!,
  }));
  const adapters = names.map((name) => {
    const known = options.adapters.find((adapter) => adapter.name === name);
    return {
      name,
      version: known?.version,
      loaded: known != null,
      instances: paired
        .filter((entry) => entry.adapter === name)
        .map((entry) => entry.instance),
    };
  });

  return { adapters, totalInstances: instances.length };
};

export const collectBotStats = (
  report: AdapterReport,
): Map<string, AdapterStatusStats> => {
  const map = new Map<string, AdapterStatusStats>();
  for (const entry of report.adapters)
    for (const instance of entry.instances)
      map.set(`${entry.name}:${instance.bot_id}`, instance.stats);
  return map;
};

const STAT_GROUPS: ReadonlyArray<
  readonly [
    icon: string,
    fields: ReadonlyArray<readonly [keyof AdapterStatusStats, string]>,
  ]
> = [
  [
    "📋",
    [
      ["friends", "好友"],
      ["groups", "群"],
    ],
  ],
  [
    "📮",
    [
      ["received", "收"],
      ["sent", "发"],
    ],
  ],
];

const formatStats = (stats: AdapterStatusStats): string => {
  const segments: string[] = [];
  for (const [icon, fields] of STAT_GROUPS) {
    const parts = fields
      .filter(([key]) => stats[key] != null)
      .map(([key, label]) => `${label} ${localNum(stats[key]!)}`);
    if (parts.length) segments.push(`${icon} ${parts.join(" / ")}`);
  }
  return segments.join(" · ");
};

const formatInstance = (instance: AdapterInstanceStatus): string[] => {
  const impl = [instance.impl, instance.version].filter(Boolean).join("/");
  const tags = [impl, instance.online ? "" : "🔴 离线"].filter(Boolean);
  const lines = [
    `👤 ${instance.nickname || "(未命名)"} (${instance.bot_id})${tags.length ? ` · ${tags.join(" · ")}` : ""}`,
  ];
  const uptime =
    instance.online && instance.connected_at != null
      ? `⏳ 已连接 ${prettyMs(Date.now() - instance.connected_at, { hideYear: true, secondsDecimalDigits: 0 })}`
      : "";
  const detail = [formatStats(instance.stats), uptime]
    .filter(Boolean)
    .join(" · ");
  if (detail) lines.push(detail);
  return lines;
};

const summarize = (entry: AdapterReportEntry): string => {
  const total = entry.instances.length;
  if (total === 0) return entry.loaded ? "🔴 未连接" : "⚪ 未加载";
  const online = entry.instances.filter((instance) => instance.online).length;
  if (online === total) return `🟢 ${localNum(total)} 实例`;
  return `${online === 0 ? "🔴" : "🟡"} ${localNum(online)}/${localNum(total)} 实例在线`;
};

export const formatAdapterReport = (report: AdapterReport): string => {
  if (!report.adapters.length)
    return "〓 🔌 mioku 适配器 〓\n(未加载任何适配器)";

  const lines = report.adapters.flatMap((entry) => [
    `🔌 ${entry.name}${entry.version ? `/${entry.version}` : ""} · ${summarize(entry)}`,
    ...entry.instances.flatMap(formatInstance),
  ]);

  return ["〓 🔌 mioku 适配器 〓", ...lines].join("\n");
};
