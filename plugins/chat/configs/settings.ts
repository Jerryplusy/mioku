export const SETTINGS_CONFIG = {
  blacklistGroups: [],
  whitelistGroups: [],
  imageAnalysisBlacklistUsers: [], // 图片分析黑名单用户（QQ号）
  maxSessions: 100,
  enableGroupAdmin: true,
  enableExternalSkills: true,
  nicknames: ["miku", "未来", "初音"],
  cooldownAfterReplyMs: 20_000,
  dynamicDelay: {
    enabled: true,
    interactionWindowMs: 600_000,
    baseDelayMs: 60_000,
    maxDelayMs: 600_000,
  },
};
