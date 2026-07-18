export interface MessageFilterRule {
  whitelist: number[];
  blacklist: number[];
}

export interface MessageFilterConfig {
  user: MessageFilterRule;
  group: MessageFilterRule;
}

export interface BootPluginConfig {
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
}

export const BOOT_DEFAULT_CONFIG: BootPluginConfig = {
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

export function normalizeBootConfig(config: BootPluginConfig | any): BootPluginConfig {
  const merged: BootPluginConfig = {
    ...cloneConfig(BOOT_DEFAULT_CONFIG),
    ...(config || {}),
    likeCommand: {
      ...cloneConfig(BOOT_DEFAULT_CONFIG.likeCommand),
      ...(config?.likeCommand || {}),
    },
    friend: {
      ...cloneConfig(BOOT_DEFAULT_CONFIG.friend),
      ...(config?.friend || {}),
    },
    group: {
      ...cloneConfig(BOOT_DEFAULT_CONFIG.group),
      ...(config?.group || {}),
      minMemberCount:
        Number(config?.group?.minMemberCount) ||
        BOOT_DEFAULT_CONFIG.group.minMemberCount,
    },
    messageFilter: {
      user: normalizeFilterRule(config?.messageFilter?.user),
      group: normalizeFilterRule(config?.messageFilter?.group),
    },
  };
  return merged;
}