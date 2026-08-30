import { createInterface, type Interface } from "node:readline";

import type { Logger } from "mioku";

export type PendingKind = "slider" | "device" | "auth";

export type PendingAction = (arg?: string) => Promise<void>;

/** 一次等待主人通过 `.icqq` 指令提交的登录验证请求 */
export interface PendingRequest {
  /** 实例标识，如 "Bot1"，用于同一实例新请求替换旧请求 */
  key: string;
  /** 展示名，如 "icqq Bot1" */
  label: string;
  /** 指令中可用的目标 token：实例序号（1、2…）与 QQ 号 */
  targets: string[];
  kind: PendingKind;
  /** 打印到终端 / 推送给主人的提示文本 */
  prompt: string;
  /** 指令动词（slider/sms/login）到执行函数的映射 */
  actions: Record<string, PendingAction>;
  createdAt: number;
}

const COMMAND = ".icqq";

const KIND_LABEL: Record<PendingKind, string> = {
  slider: "滑块验证",
  device: "设备锁验证",
  auth: "身份验证",
};

const VERB_LABEL: Record<string, string> = {
  slider: "滑块验证",
  sms: "设备锁验证",
  login: "登录",
};

let pending: PendingRequest[] = [];
const notifiers: Array<(text: string) => void> = [];
let stdinInterface: Interface | undefined;

export const listPending = (): readonly PendingRequest[] => pending;

export const registerPending = (
  request: PendingRequest,
  logger: Logger,
): void => {
  const index = pending.findIndex((item) => item.key === request.key);
  if (index >= 0) pending.splice(index, 1);
  pending.push(request);
  logger.warn(request.prompt);
  for (const notify of notifiers) {
    try {
      notify(request.prompt);
    } catch {
      // 推送失败不影响登录流程
    }
  }
};

export const clearPending = (key: string): void => {
  pending = pending.filter((item) => item.key !== key);
};

export const addNotifier = (notify: (text: string) => void): (() => void) => {
  notifiers.push(notify);
  return () => {
    const index = notifiers.indexOf(notify);
    if (index >= 0) notifiers.splice(index, 1);
  };
};

export const attachStdinListener = (logger: Logger): void => {
  if (stdinInterface) return;
  stdinInterface = createInterface({ input: process.stdin, terminal: false });
  let queue: Promise<void> = Promise.resolve();
  stdinInterface.on("line", (line) => {
    if (!line.trimStart().startsWith(COMMAND)) return;
    queue = queue.then(async () => {
      await handleIcqqCommand(line, async (output) => {
        logger.info(output);
      });
    });
  });
};

export const detachStdinListener = (): void => {
  try {
    stdinInterface?.close();
  } catch {
    // ignore
  }
  stdinInterface = undefined;
};

const helpText = (): string =>
  [
    ".icqq — icqq 登录验证指令（仅主人可用）",
    "  .icqq help                  显示本帮助",
    "  .icqq status                查看待处理的验证请求",
    "  .icqq [目标] slider <ticket[,randstr]>  提交滑块验证 ticket",
    "  .icqq [目标] sms [验证码]    重发短信 / 提交设备锁短信验证码",
    "  .icqq [目标] login          浏览器完成 URL 验证后重试登录",
  ].join("\n");

const statusText = (target?: string): string => {
  if (pending.length === 0) return "当前没有待处理的 icqq 登录验证";
  const items = target
    ? pending.filter((item) => item.targets.includes(target))
    : pending;
  if (items.length === 0)
    return `未找到目标 ${target} 的待处理验证，输入 .icqq status 查看全部`;
  const lines = items.map((item) => {
    const minutes = Math.floor((Date.now() - item.createdAt) / 60_000);
    const wait = minutes > 0 ? `，已等待 ${minutes} 分钟` : "";
    return `  [${item.targets[0]}] ${item.label}（uin ${item.targets[1] ?? "?"}）：${KIND_LABEL[item.kind]}${wait}`;
  });
  return ["待处理的 icqq 登录验证：", ...lines].join("\n");
};

const matching = (verb: string, target?: string): PendingRequest[] =>
  pending.filter(
    (item) =>
      item.actions[verb] != null && (!target || item.targets.includes(target)),
  );

const suggestion = (
  verb: string,
  items: PendingRequest[],
  arg?: string,
): string =>
  items
    .map((item) => `.icqq ${item.targets[0]} ${verb}${arg ? ` ${arg}` : ""}`)
    .join(" 或 ");

const runClaimed = async (
  verb: string,
  target: string | undefined,
  arg: string | undefined,
  reply: (text: string) => void | Promise<void>,
): Promise<void> => {
  const items = matching(verb, target);
  if (items.length === 0) {
    await reply(
      `没有待处理的${VERB_LABEL[verb]}请求${target ? `（目标 ${target}）` : ""}，输入 .icqq status 查看`,
    );
    return;
  }
  if (items.length > 1) {
    await reply(
      `存在多个待处理的${VERB_LABEL[verb]}请求，请指定目标：${suggestion(verb, items, arg)}`,
    );
    return;
  }
  const request = items[0]!;
  pending = pending.filter((item) => item !== request);
  try {
    await request.actions[verb]!(arg);
    await reply(
      `已提交 ${request.label} 的${VERB_LABEL[verb]}，请等待登录结果`,
    );
  } catch (err) {
    if (!pending.some((item) => item.key === request.key))
      pending.push(request);
    await reply(
      `提交失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

const runKeep = async (
  verb: string,
  target: string | undefined,
  reply: (text: string) => void | Promise<void>,
): Promise<void> => {
  const items = matching(verb, target);
  if (items.length === 0) {
    await reply(
      `没有待处理的${VERB_LABEL[verb]}请求${target ? `（目标 ${target}）` : ""}，输入 .icqq status 查看`,
    );
    return;
  }
  if (items.length > 1) {
    await reply(
      `存在多个待处理的${VERB_LABEL[verb]}请求，请指定目标：${suggestion(verb, items)}`,
    );
    return;
  }
  const request = items[0]!;
  try {
    await request.actions[verb]!(undefined);
    await reply(`已向 ${request.label} 重新发送验证短信`);
  } catch (err) {
    await reply(
      `短信发送失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export const handleIcqqCommand = async (
  input: string,
  reply: (text: string) => void | Promise<void>,
): Promise<boolean> => {
  const text = input.trim();
  if (!text.startsWith(COMMAND)) return false;
  const tokens = text
    .slice(COMMAND.length)
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  let target: string | undefined;
  let verb: string;
  let arg: string | undefined;
  if (tokens.length === 0) {
    verb = "help";
  } else if (/^\d+$/.test(tokens[0]!)) {
    target = tokens[0];
    verb = tokens[1] ?? "status";
    arg = tokens[2];
  } else {
    verb = tokens[0]!;
    arg = tokens[1];
  }
  try {
    switch (verb) {
      case "help":
        await reply(helpText());
        break;
      case "status":
        await reply(statusText(target));
        break;
      case "slider":
        if (!arg) {
          await reply("用法：.icqq [目标] slider <ticket[,randstr]>");
          break;
        }
        await runClaimed(verb, target, arg, reply);
        break;
      case "sms":
        if (arg) await runClaimed(verb, target, arg, reply);
        else await runKeep(verb, target, reply);
        break;
      case "login":
        await runClaimed(verb, target, undefined, reply);
        break;
      default:
        await reply(`未知指令：.icqq ${verb}，输入 .icqq help 查看用法`);
    }
  } catch (err) {
    await reply(
      `指令执行失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return true;
};
