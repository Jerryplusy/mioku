export interface MessageFilterRule {
  whitelist: number[];
  blacklist: number[];
}

export interface MessageFilterConfig {
  user: MessageFilterRule;
  group: MessageFilterRule;
}

export interface AutoUpdateConfig {
  enabled: boolean;
  time: string;
  frequency: "daily" | "weekly" | "monthly";
}

export interface CorePluginConfig {
  likeCommand: {
    enabled: boolean;
    keyword: string;
    likeTimes: number;
    reactionEmojiId: number;
  };
  friend: {
    autoApprove: boolean;
  };
  group: {
    minMemberCount: number;
  };
  messageFilter: MessageFilterConfig;
  autoUpdate: AutoUpdateConfig;
}

export const CORE_DEFAULT_CONFIG: CorePluginConfig = {
  likeCommand: {
    enabled: true,
    keyword: "赞我",
    likeTimes: 10,
    reactionEmojiId: 201,
  },
  friend: {
    autoApprove: true,
  },
  group: {
    minMemberCount: 0,
  },
  messageFilter: {
    user: { whitelist: [], blacklist: [] },
    group: { whitelist: [], blacklist: [] },
  },
  autoUpdate: {
    enabled: true,
    time: "03:00",
    frequency: "daily",
  },
};

function normalizeIdList(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((v) => Math.floor(Number(v)))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
}

function normalizeFilterRule(input: any): MessageFilterRule {
  return {
    whitelist: normalizeIdList(input?.whitelist),
    blacklist: normalizeIdList(input?.blacklist),
  };
}

export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeCoreConfig(config: CorePluginConfig | any): CorePluginConfig {
  const merged: CorePluginConfig = {
    ...cloneConfig(CORE_DEFAULT_CONFIG),
    ...(config || {}),
    likeCommand: {
      ...cloneConfig(CORE_DEFAULT_CONFIG.likeCommand),
      ...(config?.likeCommand || {}),
    },
    friend: {
      ...cloneConfig(CORE_DEFAULT_CONFIG.friend),
      ...(config?.friend || {}),
    },
    group: {
      ...cloneConfig(CORE_DEFAULT_CONFIG.group),
      ...(config?.group || {}),
      minMemberCount:
        Number(config?.group?.minMemberCount) ||
        CORE_DEFAULT_CONFIG.group.minMemberCount,
    },
    messageFilter: {
      user: normalizeFilterRule(config?.messageFilter?.user),
      group: normalizeFilterRule(config?.messageFilter?.group),
    },
    autoUpdate: {
      ...cloneConfig(CORE_DEFAULT_CONFIG.autoUpdate),
      ...(config?.autoUpdate || {}),
      time: config?.autoUpdate?.time || CORE_DEFAULT_CONFIG.autoUpdate.time,
      frequency: ["daily", "weekly", "monthly"].includes(config?.autoUpdate?.frequency)
        ? config.autoUpdate.frequency
        : CORE_DEFAULT_CONFIG.autoUpdate.frequency,
    },
  };
  return merged;
}
