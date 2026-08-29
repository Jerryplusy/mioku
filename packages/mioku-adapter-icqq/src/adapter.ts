import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  avatarSet,
  bindCapabilities,
  botStatus,
  colors,
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
  type IcqqAdapterConfig,
  type IcqqInstanceConfig,
} from "./config";
import { createIcqqBot, type IcqqBot, type IcqqData } from "./bot";
import { createCaptchaHandler } from "./captcha";
import {
  buildMessageEvent,
  buildNoticeEvent,
  buildRequestEvent,
} from "./event";
import { toIcqqMessage } from "./message";
import type {
  Adapter,
  AdapterContext,
  AdapterFactoryOptions,
  Bot,
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
    botData.online = true;
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
    await context.emitLifecycle({ type: "bot:connected", bot });
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
    version: "1.0.0",
    async start(next) {
      context = next;
      client = createClient({
        ...(instance.config ?? {}),
        ver: instance.ver ?? instance.config?.ver,
        sign_api_addr: instance.sign_api_addr ?? instance.config?.sign_api_addr,
        ignore_self:
          instance.ignore_self ?? instance.config?.ignore_self ?? true,
      });
      const captcha = createCaptchaHandler({
        client,
        logger,
        label: `icqq Bot${index + 1}`,
      });
      bind("system.online", () => {
        void startBot();
      });
      // icqq 的 em() 会同时派发完整事件名与各上级前缀，
      // 因此监听 system.offline 即可覆盖 system.offline.network / system.offline.kickoff
      bind("system.offline", (event) => {
        void stopBot(
          String((event as { message?: string }).message ?? "offline"),
        );
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
      });
      bind("system.login.slider", (event) => {
        void captcha.handleSlider(event as { url: string });
      });
      bind("system.login.device", (event) => {
        void captcha.handleDeviceLock(event as { url: string; phone: string });
      });
      bind("system.login.auth", (event) => {
        const url = (event as { url?: string }).url;
        logger.warn(
          `icqq Bot${index + 1} 需要身份验证，请打开以下链接处理: ${url ?? "未知链接"}`,
        );
      });
      bind("system.login.error", (event) =>
        logger.error(
          `icqq Bot${index + 1} 登录失败: ${String((event as { message?: string }).message ?? event)}`,
        ),
      );
      bind("message", (event) => {
        const counters = countersByBot.get(botData.bot_id);
        if (counters) counters.receive++;
        if (bot)
          void context?.dispatch(
            buildMessageEvent(
              bot,
              event as Parameters<typeof buildMessageEvent>[1],
            ),
          );
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
        void context?.dispatch(
          buildRequestEvent(bot, request, async (yes, reason) => {
            if (request.request_type === "friend") return request.approve(yes);
            return client!.setGroupAddRequest(request.flag, yes, reason);
          }),
        );
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
      }
    },
    async stop(reason) {
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
    },
  };
};

export const icqqAdapterDefinition = defineAdapter<IcqqAdapterConfig>({
  name: NAME,
  version: "1.0.0",
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
      try {
        const [friendList, groupList] = await Promise.all([
          currentBot.getFriendList(),
          currentBot.getGroupList(),
        ]);
        return {
          adapter: NAME,
          version: "1.0.0",
          data: {
            friends: friendList.length,
            groups: groupList.length,
            send: counters.send,
            receive: counters.receive,
          },
        };
      } catch {
        return { adapter: NAME, version: "1.0.0", data: {} };
      }
    };
    let unregisterStatus: (() => void) | undefined;
    return {
      name: NAME,
      version: "1.0.0",
      async start(context) {
        unregisterStatus = registerStatusProvider(NAME, statusProvider);
        for (const adapter of adapters) await adapter.start(context);
      },
      async stop(reason) {
        unregisterStatus?.();
        unregisterStatus = undefined;
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
