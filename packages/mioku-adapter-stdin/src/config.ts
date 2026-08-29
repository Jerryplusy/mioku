export interface StdinAdapterConfig {
  /** 终端输入提示符，仅在 TTY 下显示，默认 "mioku> " */
  prompt?: string
  /** stdin 会话对应的 bot 昵称，默认 "stdin" */
  nickname?: string
  /** 输入流关闭（EOF / Ctrl+D）时是否直接退出进程，默认 false */
  exit_on_eof?: boolean
}

export const normalizeConfig = (input: unknown): StdinAdapterConfig => {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const config: StdinAdapterConfig = {};
  if (typeof raw.prompt === "string" && raw.prompt.length > 0)
    config.prompt = raw.prompt;
  if (typeof raw.nickname === "string" && raw.nickname.length > 0)
    config.nickname = raw.nickname;
  if (typeof raw.exit_on_eof === "boolean") config.exit_on_eof = raw.exit_on_eof;
  return config;
};
