export const SETTINGS_CONFIG = {
  blacklistGroups: [],
  whitelistGroups: [],
  maxSessions: 100,
  enableGroupAdmin: true,
  enableExternalSkills: true,
  nicknames: ["miku", "未来", "初音"],
  // 聊天防抖时间（毫秒）：AI 回复完后等待这段时间，收集期间的 @bot 或关键词消息，
  // 然后一次性处理而不是每次都请求 AI。默认 20 秒
  cooldownAfterReplyMs: 20_000,
};
