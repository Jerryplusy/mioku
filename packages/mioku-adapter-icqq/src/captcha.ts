import type { Client } from "mioku-adapter-icqq/vendor/icqq";

import type { Logger } from "mioku";
import {
  registerPending,
  type PendingKind,
  type PendingRequest,
} from "./interact";

export interface CaptchaHandlerOptions {
  client: Client;
  logger: Logger;
  /** 展示名，如 "icqq Bot1" */
  label: string;
  /** 实例标识，如 "Bot1"，同实例的新验证请求会替换旧请求 */
  key: string;
  /** 指令中可用的目标 token：实例序号与 QQ 号 */
  targets: string[];
  /** 重新发起登录（浏览器完成 URL 验证后由 `.icqq login` 调用） */
  retryLogin: () => Promise<void>;
}

/**
 * 命令式登录验证：验证码不再通过本地浏览器页面提交，
 * 而是注册待处理请求，由主人通过 `.icqq ...` 指令（终端或任意已连接 bot）提交。
 */
export const createCaptchaHandler = (options: CaptchaHandlerOptions) => {
  const { client, logger, label, key, targets, retryLogin } = options;

  const register = (
    kind: PendingKind,
    prompt: string,
    actions: PendingRequest["actions"],
  ): void => {
    registerPending(
      { key, label, targets, kind, prompt, actions, createdAt: Date.now() },
      logger,
    );
  };

  return {
    /** 滑块验证：打开 URL 完成滑块后，把跳转 URL 的 ticket 通过指令提交 */
    handleSlider(event: { url: string }) {
      const prompt = [
        `${label} 需要滑块验证，请打开以下链接完成滑块：`,
        event.url,
        `完成后，将跳转地址栏中 ticket 参数的值（若同时含 randstr，用英文逗号拼接为 ticket,randstr）通过指令提交：`,
        `  .icqq ${targets[0]} slider <ticket[,randstr]>`,
      ].join("\n");
      register("slider", prompt, {
        slider: (ticket) => client.submitSlider(ticket ?? ""),
      });
    },

    handleDeviceLock(event: { url: string; phone?: string }) {
      const phone = (event.phone ?? "").trim();
      const hasSms = phone.length > 0;
      const prompt = hasSms
        ? [
            `${label} 需要设备锁验证（密保手机 ${phone}），请提交收到的短信验证码：`,
            `  .icqq ${targets[0]} sms <验证码>`,
            `短信未收到可重发：.icqq ${targets[0]} sms`,
            `或在浏览器完成以下链接验证后输入 .icqq ${targets[0]} login：`,
            event.url,
          ].join("\n")
        : [
            `${label} 需要设备锁验证（新设备保护），请在浏览器完成以下链接验证：`,
            event.url,
            `完成后输入 .icqq ${targets[0]} login 重试登录`,
          ].join("\n");
      const actions: PendingRequest["actions"] = hasSms
        ? {
            sms: (code) =>
              code ? client.submitSmsCode(code) : client.sendSmsCode(),
            login: () => retryLogin(),
          }
        : { login: () => retryLogin() };
      register("device", prompt, actions);
    },

    /** 身份验证：浏览器完成 URL 验证后，通过指令重试登录 */
    handleAuth(event: { url: string }) {
      const prompt = [
        `${label} 需要身份验证，请打开以下链接完成验证：`,
        event.url,
        `完成后输入 .icqq ${targets[0]} login 重试登录`,
      ].join("\n");
      register("auth", prompt, {
        login: () => retryLogin(),
      });
    },
  };
};
