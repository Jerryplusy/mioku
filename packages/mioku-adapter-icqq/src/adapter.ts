import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  avatarSet,
  avatarGet,
  bindCapabilities,
  botConfig,
  botStatus,
  colors,
  connectedBots,
  conversationGetHistory,
  defineAdapter,
  forwardSend,
  friendDelete,
  friendGetInfo,
  friendGetList,
  groupGetInfo,
  groupGetList,
  groupGetMembers,
  groupLeave,
  groupSetName,
  groupSetPortrait,
  groupSetWholeBan,
  isOwner,
  memberBan,
  memberGetInfo,
  memberKick,
  memberPoke,
  memberSetAdmin,
  memberSetCard,
  memberSetTitle,
  messageGet,
  messageGetForward,
  messageRecall,
  messageSend,
  profileSet,
  registerStatusProvider,
  text as extractText,
  type AdapterStatus,
} from "mioku";
import {
  createClient,
  type Client,
  type FriendRequestEvent,
  type GroupInviteEvent,
  type GroupRequestEvent,
} from "mioku-adapter-icqq/vendor/icqq";
import {
  normalizeInstances,
  normalizePlatform,
  platformLabel,
  type IcqqAdapterConfig,
  type IcqqInstanceConfig,
} from "./config";
import { version as icqqVersion } from "../vendor/icqq/package.json" with { type: "json" };
import { version as adapterVersion } from "../package.json" with { type: "json" };
import { createIcqqBot, type IcqqBot, type IcqqData } from "./bot";
import { createCaptchaHandler } from "./captcha";
import { bridgeIcqqLog4js } from "./logger-bridge";
import {
  addNotifier,
  attachStdinListener,
  clearPending,
  detachStdinListener,
  handleIcqqCommand,
  listPending,
} from "./interact";
import {
  buildMessageEvent,
  buildNoticeEvent,
  buildRequestEvent,
} from "./event";
import { toIcqqMessage } from "./message";
import { AdapterEventDeduplicator } from "./dedup";
import type {
  Adapter,
  AdapterContext,
  AdapterFactoryOptions,
  Bot,
  Event,
  MessageEvent,
} from "mioku";

const NAME = "icqq";
const notices = ["notice.friend", "notice.group"] as const;

type BotCounters = { send: number; receive: number };

const build = (
  instance: IcqqInstanceConfig,
  logger: import("mioku").Logger,
  index: number,
  countersByBot: Map<string, BotCounters>,
): Adapter => {
  const key = `Bot${index + 1}`;
  const label = `icqq ${key}`;
  const targets = [String(index + 1), String(instance.uin)];
  const dedup = new AdapterEventDeduplicator();
  let client: Client | undefined;
  let bot: IcqqBot | undefined;
  let context: AdapterContext | undefined;
  let unregisterBot: (() => void) | undefined;
  let unregisterCapabilities: Array<() => void> = [];
  let disposers: Array<() => void> = [];
  const botData: IcqqData = {
    bot_id: "",
    adapter: NAME,
    nickname: "",
    online: false,
    connected_at: undefined as number | undefined,
  };
  const bind = (event: string, listener: (value: unknown) => void): void => {
    client!.on(event, listener);
    disposers.push(() => client?.off(event));
  };
  const notifyOwners = (text: string): void => {
    const owners = botConfig.owners
      .map((owner) => Number(owner))
      .filter((uin) => Number.isFinite(uin) && uin > 0);
    if (owners.length === 0) return;
    const selfUin = String(client?.uin ?? 0);
    for (const uin of owners) {
      void (async () => {
        if (client?.isOnline()) {
          try {
            await client.sendPrivateMsg(uin, text);
            return;
          } catch {
            // 客户端发送失败时回退到其它已连接的 bot
          }
        }
        for (const other of connectedBots.values()) {
          if (other.adapter === NAME && other.bot_id === selfUin) continue;
          try {
            await other.sendMessage(
              { type: "private", user_id: String(uin) },
              text,
            );
            return;
          } catch {
            // 尝试下一个 bot
          }
        }
      })();
    }
  };
  let settleLoginWait: (() => void) | undefined;
  const loginSettled = new Promise<void>((resolve) => {
    settleLoginWait = resolve;
  });
  let loginWaitDone = false;
  const settleLogin = (): void => {
    if (loginWaitDone) return;
    loginWaitDone = true;
    settleLoginWait?.();
  };

  const registerBotCapabilities = (
    ctx: AdapterContext,
    currentBot: IcqqBot,
  ): Array<() => void> => {
    const target = { adapter: NAME, bot_id: currentBot.bot_id };
    return [
      ctx.registerCapability(messageSend, target, (req) =>
        currentBot.sendMessage(req.target, req.message),
      ),
      ctx.registerCapability(messageRecall, target, async (req) => {
        await currentBot.recallMessage(req.message_id);
      }),
      ctx.registerCapability(messageGet, target, (req) =>
        currentBot.getMessage(req.message_id),
      ),
      ctx.registerCapability(messageGetForward, target, (req) =>
        currentBot.getForwardMessage(req.message_id),
      ),
      ctx.registerCapability(memberBan, target, async (req) => {
        await currentBot.banMember(req.group_id, req.user_id, req.duration);
      }),
      ctx.registerCapability(memberKick, target, async (req) => {
        await currentBot.kickMember(
          req.group_id,
          req.user_id,
          req.reject_add_request,
        );
      }),
      ctx.registerCapability(memberSetCard, target, async (req) => {
        await currentBot.setMemberCard(req.group_id, req.user_id, req.card);
      }),
      ctx.registerCapability(memberSetAdmin, target, async (req) => {
        await currentBot.setMemberAdmin(req.group_id, req.user_id, req.enable);
      }),
      ctx.registerCapability(memberGetInfo, target, (req) =>
        currentBot.getMemberInfo(req.group_id, req.user_id),
      ),
      ctx.registerCapability(groupGetInfo, target, (req) =>
        currentBot.getGroupInfo(req.group_id),
      ),
      ctx.registerCapability(groupGetMembers, target, (req) =>
        currentBot.getGroupMembers(req.group_id),
      ),
      ctx.registerCapability(groupLeave, target, async (req) => {
        await currentBot.leaveGroup(req.group_id);
      }),
      ctx.registerCapability(groupSetName, target, async (req) => {
        await currentBot.setGroupName(req.group_id, req.group_name);
      }),
      ctx.registerCapability(groupSetPortrait, target, async (req) => {
        await currentBot.setGroupPortrait(req.group_id, req.file);
      }),
      ctx.registerCapability(groupGetList, target, () =>
        currentBot.getGroupList(),
      ),
      ctx.registerCapability(friendGetInfo, target, (req) =>
        currentBot.getFriendInfo(req.user_id),
      ),
      ctx.registerCapability(friendDelete, target, async (req) => {
        await currentBot.deleteFriend(req.user_id);
      }),
      ctx.registerCapability(friendGetList, target, () =>
        currentBot.getFriendList(),
      ),
      ctx.registerCapability(conversationGetHistory, target, (req) =>
        currentBot.getHistory(
          req.target,
          req.before == null ? undefined : String(req.before),
          req.limit,
        ),
      ),
      ctx.registerCapability(memberPoke, target, async (req) => {
        await currentBot.client.sendGroupPoke(
          Number(req.group_id),
          Number(req.user_id),
        );
      }),
      ctx.registerCapability(memberSetTitle, target, async (req) => {
        await currentBot.client.setGroupSpecialTitle(
          Number(req.group_id),
          Number(req.user_id),
          req.title,
        );
      }),
      ctx.registerCapability(groupSetWholeBan, target, async (req) => {
        await currentBot.client.setGroupWholeBan(
          Number(req.group_id),
          req.enable,
        );
      }),
      ctx.registerCapability(forwardSend, target, async (req) => {
        const nodes = req.nodes.map((node) => ({
          user_id: Number(node.user_id),
          nickname: node.nickname,
          message: toIcqqMessage(node.content),
        }));
        const icqqClient = currentBot.client;
        if (req.target.type === "group" && req.target.group_id) {
          const group = icqqClient.pickGroup(Number(req.target.group_id));
          const msg = await group.makeForwardMsg(nodes);
          const sent = await group.sendMsg(msg);
          return { message_id: sent?.message_id };
        }
        if (req.target.type === "private" && req.target.user_id) {
          const friend = icqqClient.pickFriend(Number(req.target.user_id));
          const msg = await friend.makeForwardMsg(nodes);
          const sent = await friend.sendMsg(msg);
          return { message_id: sent?.message_id };
        }
        throw new Error("forwardSend: invalid target");
      }),
      ctx.registerCapability(profileSet, target, async (req) => {
        const c = currentBot.client;
        if (typeof req.nickname === "string") await c.setNickname(req.nickname);
        if (typeof req.personal_note === "string")
          await c.setSignature(req.personal_note);
        if (typeof req.sex === "number")
          await c.setGender(req.sex as 0 | 1 | 2);
      }),
      ctx.registerCapability(avatarSet, target, async (req) => {
        await currentBot.client.setAvatar(
          req.file as Parameters<typeof currentBot.client.setAvatar>[0],
        );
      }),
      ctx.registerCapability(avatarGet, target, async () => {
        // icqq 账号即 QQ 号,直接走 QQ 号头像服务
        return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(currentBot.bot_id)}&s=640`;
      }),
      ctx.registerCapability(botStatus, target, async () => {
        try {
          const info = await currentBot.client.getStatusInfo();
          return {
            online: Boolean(info && info.status === 11),
            app_name: "icqq",
          };
        } catch {
          return { online: false, app_name: "icqq" };
        }
      }),
    ];
  };

  const startBot = async (): Promise<void> => {
    if (!client || !context) return;
    botData.bot_id = String(client.uin ?? 0);
    botData.nickname = client.nickname;
    botData.connected_at = Date.now();
    if (!bot) {
      countersByBot.set(botData.bot_id, { send: 0, receive: 0 });
      bot = bindCapabilities(
        createIcqqBot(client, botData),
        context.getCapabilityRegistry(),
      );
      unregisterBot = context.registerBot(bot).unregister;
      unregisterCapabilities = registerBotCapabilities(context, bot);
    }
    if (!botData.online) {
      botData.online = true;
      logger.info(
        `已连接 icqq Bot${index + 1}: ${colors.cyan(String(client.uin))}`,
      );
      await context.emitLifecycle({ type: "bot:connected", bot });
    }
  };

  const stopBot = async (reason: string): Promise<void> => {
    if (bot && botData.online) {
      botData.online = false;
      if (context)
        await context.emitLifecycle({ type: "bot:disconnected", bot, reason });
    }
  };

  return {
    name: `${NAME}.${index + 1}`,
    version: adapterVersion,
    async start(next) {
      context = next;
      // icqq 内部用 log4js 打日志，先桥接到 mioku logger 再创建客户端，避免启动横幅等漏出
      bridgeIcqqLog4js(logger);
      client = createClient({
        ...(instance.config ?? {}),
        data_dir:
          instance.config?.data_dir ??
          path.join(process.cwd(), "data", "icqq"),
        ver: instance.ver ?? instance.config?.ver,
        sign_api_addr: instance.sign_api_addr ?? instance.config?.sign_api_addr,
        ignore_self:
          instance.ignore_self ?? instance.config?.ignore_self ?? true,
        platform: normalizePlatform(
          instance.platform ?? instance.config?.platform,
        ),
      });
      bridgeIcqqLog4js(logger);
      const captcha = createCaptchaHandler({
        client,
        logger,
        label,
        key,
        targets,
        retryLogin: () => client!.login(instance.uin, instance.password),
      });
      disposers.push(addNotifier((prompt) => notifyOwners(prompt)));
      bind("system.online", () => {
        const hadPending = listPending().some((item) => item.key === key);
        clearPending(key);
        void startBot();
        if (hadPending) notifyOwners(`${label} 登录成功，已上线`);
        settleLogin();
      });
      // icqq 的 em() 会同时派发完整事件名与各上级前缀，
      // 因此监听 system.offline 即可覆盖 system.offline.network / system.offline.kickoff
      bind("system.offline", (event) => {
        void stopBot(
          String((event as { message?: string }).message ?? "offline"),
        );
        settleLogin();
      });
      bind("system.login.qrcode", (event) => {
        const image = (event as { image?: Buffer }).image;
        const file = path.join(
          os.tmpdir(),
          `mioku-icqq-qrcode-${index + 1}.png`,
        );
        try {
          if (image && image.length > 0) {
            fs.writeFileSync(file, image);
            logger.warn(`icqq Bot${index + 1} 请使用 QQ 扫码登录: ${file}`);
          } else {
            logger.warn(
              `icqq Bot${index + 1} 需要扫码登录（未获取到二维码图片）`,
            );
          }
        } catch (err) {
          logger.warn(
            `icqq Bot${index + 1} 二维码保存失败: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        settleLogin();
      });
      bind("system.login.slider", (event) => {
        void captcha.handleSlider(event as { url: string });
        settleLogin();
      });
      bind("system.login.device", (event) => {
        void captcha.handleDeviceLock(
          event as { url: string; phone?: string },
        );
        settleLogin();
      });
      bind("system.login.auth", (event) => {
        void captcha.handleAuth(event as { url: string });
        settleLogin();
      });
      bind("system.token.expire", () => settleLogin());
      bind("system.login.error", (event) => {
        const message = String(
          (event as { message?: string }).message ?? event,
        );
        logger.error(`icqq Bot${index + 1} 登录失败: ${message}`);
        notifyOwners(`${label} 登录失败: ${message}`);
        settleLogin();
      });
      bind("message", (event) => {
        const counters = countersByBot.get(botData.bot_id);
        if (counters) counters.receive++;
        if (!bot) return;
        const messageEvent = buildMessageEvent(
          bot,
          event as Parameters<typeof buildMessageEvent>[1],
        );
        if (dedup.isDuplicate(messageEvent.identity)) {
          logger.debug(
            `icqq ${key} 丢弃重复消息: ${messageEvent.message_id ?? "(无 id)"}`,
          );
          return;
        }
        void context?.dispatch(messageEvent);
      });
      bind("sync.message", (event) => {
        const counters = countersByBot.get(botData.bot_id);
        if (counters) counters.receive++;
      });
      bind("send", () => {
        const counters = countersByBot.get(botData.bot_id);
        if (counters) counters.send++;
      });
      for (const name of notices)
        bind(name, (event) => {
          if (bot)
            void context?.dispatch(
              buildNoticeEvent(bot, event as Record<string, unknown>),
            );
        });
      bind("request", (event) => {
        if (!bot) return;
        const request = event as
          | FriendRequestEvent
          | GroupRequestEvent
          | GroupInviteEvent;
        const requestEvent = buildRequestEvent(
          bot,
          request,
          async (yes, reason) => {
            if (request.request_type === "friend") return request.approve(yes);
            return client!.setGroupAddRequest(request.flag, yes, reason);
          },
        );
        if (dedup.isDuplicate(requestEvent.identity)) {
          logger.debug(
            `icqq ${key} 丢弃重复请求: ${request.flag ?? "(无 flag)"}`,
          );
          return;
        }
        void context?.dispatch(requestEvent);
      });
      logger.info(
        `正在登录 icqq Bot${index + 1}: ${colors.cyan(String(instance.uin))}`,
      );
      try {
        await client.login(instance.uin, instance.password);
      } catch (err) {
        logger.error(
          `icqq Bot${index + 1} 登录异常: ${err instanceof Error ? err.message : String(err)}`,
        );
        settleLogin();
      }
      const loginTimer = setTimeout(() => {
        logger.warn(
          `icqq Bot${index + 1} 登录结果等待超时，框架继续启动（登录成功后会再提示）`,
        );
        settleLogin();
      }, 60_000);
      try {
        await loginSettled;
      } finally {
        clearTimeout(loginTimer);
      }
    },
    async stop(reason) {
      settleLogin();
      await stopBot(reason ?? "stop");
      unregisterBot?.();
      unregisterBot = undefined;
      for (const dispose of unregisterCapabilities) dispose();
      unregisterCapabilities = [];
      for (const dispose of disposers) dispose();
      disposers = [];
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore
        }
        try {
          client.terminate();
        } catch {
          // ignore
        }
      }
      client = undefined;
      bot = undefined;
      dedup.clear();
    },
  };
};

export const icqqAdapterDefinition = defineAdapter<IcqqAdapterConfig>({
  name: NAME,
  version: adapterVersion,
  apiVersion: 1,
  validateConfig: (input) => {
    const instances = normalizeInstances(input);
    if (!instances.length)
      throw new Error("icqq.instances must contain at least one instance");
    return { instances };
  },
  create: (options: AdapterFactoryOptions<IcqqAdapterConfig>) => {
    const countersByBot = new Map<string, BotCounters>();
    const adapters = options.config.instances.map((instance, index) =>
      build(instance, options.logger, index, countersByBot),
    );
    const statusProvider = async ({
      bot,
    }: {
      bot: Bot;
    }): Promise<AdapterStatus> => {
      const currentBot = bot as IcqqBot;
      const counters = countersByBot.get(currentBot.bot_id) ?? {
        send: 0,
        receive: 0,
      };
      const traffic = { sent: counters.send, received: counters.receive };
      const client = currentBot.client;
      const login = {
        platform: platformLabel(client?.config?.platform),
        platform_version: client?.apk?.version,
      };
      try {
        const [friendList, groupList] = await Promise.all([
          currentBot.getFriendList(),
          currentBot.getGroupList(),
        ]);
        return {
          adapter: NAME,
          bot_id: currentBot.bot_id,
          ...login,
          stats: {
            friends: friendList.length,
            groups: groupList.length,
            ...traffic,
          },
          data: {},
        };
      } catch {
        return {
          adapter: NAME,
          bot_id: currentBot.bot_id,
          ...login,
          stats: traffic,
          data: {},
        };
      }
    };
    let unregisterStatus: (() => void) | undefined;
    let unlisten: (() => void) | undefined;

    const setupCommandChannel = (context: AdapterContext): void => {
      unlisten = context.listen("message", (event: Event) => {
        if (event.kind !== "message") return;
        const command = extractText(event).trim();
        if (!command.startsWith(".icqq")) return;
        const userId = String(event.user_id ?? "");
        if (!isOwner(userId)) {
          options.logger.warn(
            `[icqq] 非主人尝试使用 .icqq 指令，已忽略（user_id=${userId || "unknown"}）${
              userId === "stdin"
                ? '；如通过终端输入，请将 "stdin" 加入 mioku.owners'
                : ""
            }`,
          );
          return;
        }
        void handleIcqqCommand(command, async (output) => {
          try {
            await event.reply(output);
          } catch {
            options.logger.info(output);
          }
        });
      });
      if (botConfig.adapters?.["stdin"] == null) {
        attachStdinListener(options.logger);
      }
    };

    return {
      name: NAME,
      version: adapterVersion,
      impl: { name: "ICQQ", version: icqqVersion },
      async start(context) {
        unregisterStatus = registerStatusProvider(NAME, statusProvider);
        setupCommandChannel(context);
        for (const adapter of adapters) await adapter.start(context);
      },
      async stop(reason) {
        unregisterStatus?.();
        unregisterStatus = undefined;
        unlisten?.();
        unlisten = undefined;
        detachStdinListener();
        for (let index = adapters.length - 1; index >= 0; index--)
          await adapters[index].stop(reason);
      },
    };
  },
});

export {
  messageSend,
  messageRecall,
  messageGet,
  messageGetForward,
  memberBan,
  memberKick,
  memberSetCard,
  memberSetAdmin,
  memberGetInfo,
  memberPoke,
  memberSetTitle,
  groupGetInfo,
  groupGetMembers,
  groupLeave,
  groupSetName,
  groupSetPortrait,
  groupSetWholeBan,
  groupGetList,
  friendGetInfo,
  friendDelete,
  friendGetList,
  conversationGetHistory,
  forwardSend,
  profileSet,
  avatarSet,
  botStatus,
};
