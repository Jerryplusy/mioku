import {
  parseDmMessageId,
  parseGroupMessageId,
  genDmMessageId,
  genGroupMessageId,
} from "mioku-adapter-icqq/vendor/icqq";
import type {
  Client,
  FriendInfo,
  GroupInfo,
  MemberInfo,
  MessageElem,
  Quotable,
} from "mioku-adapter-icqq/vendor/icqq";
import type {
  AdapterBotBase,
  BotBase,
  ForwardNode,
  FriendInfo as CoreFriendInfo,
  GroupInfo as CoreGroupInfo,
  HistoryMessage,
  MemberInfo as CoreMemberInfo,
  MessageGetResult,
  MessageInput,
  MessageTarget,
  SentMessage,
} from "mioku";
import {
  buildSentMessage,
  fromIcqqMessage,
  replyIdOf,
  toIcqqMessage,
} from "./message";

export interface IcqqData {
  bot_id: string;
  adapter: "icqq";
  nickname: string;
  online: boolean;
  connected_at?: number;
}
const num = (value: string | number): number => Number(value);
const member = (value: MemberInfo): CoreMemberInfo => ({
  ...value,
  user_id: String(value.user_id),
  join_time: value.join_time,
  last_sent_time: value.last_sent_time,
});
const group = (value: GroupInfo): CoreGroupInfo => ({
  ...value,
  group_id: String(value.group_id),
  group_name: value.group_name,
});
const friend = (value: FriendInfo): CoreFriendInfo => ({
  ...value,
  user_id: String(value.user_id),
  nickname: value.nickname,
  remark: value.remark,
});

export type IcqqBot = BotBase & {
  readonly adapter: "icqq";
  readonly client: Client;
  /**
   * 调用 icqq Client 的原生方法。
   * action 即 icqq 的方法名（如 sendGroupPoke、setEssenceMessage、getStrangerInfo），
   * 参数按位置展开：bot.sendApi("sendGroupPoke", 123456, 654321)。
   */
  sendApi<T>(action: string, ...args: unknown[]): Promise<T>;
  pickGroup(groupId: string): ReturnType<Client["pickGroup"]>;
  pickFriend(userId: string): ReturnType<Client["pickFriend"]>;
  getFriendList(): Promise<CoreFriendInfo[]>;
  getGroupList(): Promise<CoreGroupInfo[]>;
  getGroupInfo(groupId: string): Promise<CoreGroupInfo | null>;
  getGroupMembers(groupId: string): Promise<CoreMemberInfo[]>;
  getMemberInfo(
    groupId: string,
    userId: string,
  ): Promise<CoreMemberInfo | null>;
  getFriendInfo(userId: string): Promise<CoreFriendInfo | null>;
  getHistory(
    target: MessageTarget,
    before?: string,
    limit?: number,
  ): Promise<HistoryMessage[]>;
  recallMessage(messageId: string): Promise<void>;
  getMessage(messageId: string): Promise<MessageGetResult | null>;
  getForwardMessage(messageId: string): Promise<ForwardNode[]>;
  banMember(groupId: string, userId: string, duration: number): Promise<void>;
  kickMember(groupId: string, userId: string, reject?: boolean): Promise<void>;
  setMemberCard(groupId: string, userId: string, card: string): Promise<void>;
  setMemberAdmin(
    groupId: string,
    userId: string,
    enable: boolean,
  ): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  setGroupName(groupId: string, name: string): Promise<void>;
  setGroupPortrait(groupId: string, file: string | Buffer): Promise<void>;
  deleteFriend(userId: string): Promise<void>;
  setReaction(
    message_id: string | number,
    emoji_id: string | number,
    set?: boolean,
    type?: number,
  ): Promise<void>;
  /**
   * 给好友点赞（icqq 原生 API：Client.sendLike）。
   * times 为点赞次数，默认 1。
   */
  sendLike(userId: string | number, times?: number): Promise<boolean>;
};

/** 尚未绑定能力分发的 IcqqBot，Bot 的能力方法由 bindCapabilities 按需填充 */
export type IcqqBotBase = AdapterBotBase<IcqqBot>;

declare module "mioku" {
  interface AdapterBotMap {
    icqq: IcqqBot;
  }
}

export const createIcqqBot = (client: Client, data: IcqqData): IcqqBotBase => {
  const bot = {
    get bot_id() {
      return data.bot_id;
    },
    adapter: data.adapter,
    get nickname() {
      return data.nickname;
    },
    get online() {
      return data.online;
    },
    get connected_at() {
      return data.connected_at;
    },
    client,
    async sendMessage(
      target: MessageTarget,
      message: MessageInput,
    ): Promise<SentMessage> {
      if (!data.online) {
        throw new Error(`Bot ${data.bot_id} is not online`);
      }
      const replyId = replyIdOf(message);
      let source: Quotable | undefined;
      if (replyId) {
        try {
          source = (await client.getMsg(replyId)) as Quotable | undefined;
        } catch {
          // 引用的消息不存在或已失效，降级为不带引用的普通发送
        }
      }
      const content = toIcqqMessage(message);
      const sent =
        target.type === "group" && target.group_id
          ? await client.sendGroupMsg(num(target.group_id), content, source)
          : target.user_id
            ? await client.sendPrivateMsg(num(target.user_id), content, source)
            : undefined;
      if (!sent) throw new Error(`Unsupported target type: ${target.type}`);
      return buildSentMessage(sent);
    },
    async sendApi<T>(action: string, ...args: unknown[]): Promise<T> {
      const fn = (client as unknown as Record<string, unknown>)[action];
      if (typeof fn !== "function")
        throw new Error(`Unsupported icqq api: ${action}`);
      return (fn as (...a: unknown[]) => Promise<T>).apply(client, args);
    },
    pickGroup: (groupId: string) => client.pickGroup(num(groupId)),
    pickFriend: (userId: string) => client.pickFriend(num(userId)),
    getFriendList: async () =>
      Array.from(client.getFriendList().values()).map(friend),
    getGroupList: async () =>
      Array.from(client.getGroupList().values()).map(group),
    getGroupInfo: async (groupId: string) => {
      try {
        return group(await client.getGroupInfo(num(groupId)));
      } catch {
        return null;
      }
    },
    getGroupMembers: async (groupId: string) =>
      Array.from((await client.getGroupMemberList(num(groupId))).values()).map(
        member,
      ),
    getMemberInfo: async (groupId: string, userId: string) => {
      try {
        return member(
          await client.getGroupMemberInfo(num(groupId), num(userId)),
        );
      } catch {
        return null;
      }
    },
    getFriendInfo: async (userId: string) => {
      try {
        const friend = client.pickFriend(num(userId));
        const simple = await friend.getSimpleInfo().catch(() => null);
        return {
          user_id: String(friend.user_id),
          nickname: friend.nickname ?? simple?.nickname,
          remark: friend.remark,
          user_uid: friend.user_uid,
        };
      } catch {
        return null;
      }
    },
    getHistory: async (target: MessageTarget, before?: string, limit = 20) => {
      const list =
        target.type === "group" && target.group_id
          ? await client
              .pickGroup(num(target.group_id))
              .getChatHistory(
                before ? parseGroupMessageId(before).seq : 0,
                limit,
              )
          : target.user_id
            ? await client
                .pickFriend(num(target.user_id))
                .getChatHistory(
                  before ? parseDmMessageId(before).time : undefined,
                  limit,
                )
            : [];
      const sourceIdOf = (
        item: (typeof list)[number] & { source?: { user_id?: number; seq?: number; rand?: number; time?: number } },
      ): string | undefined => {
        const source = item.source;
        if (!source || source.seq == null) return undefined;
        try {
          return target.type === "group" && target.group_id
            ? genGroupMessageId(
                num(target.group_id),
                Number(source.user_id ?? 0),
                Number(source.seq),
                Number(source.rand ?? 0),
                Number(source.time ?? 0),
              )
            : genDmMessageId(
                num(target.user_id!),
                Number(source.seq),
                Number(source.rand ?? 0),
                Number(source.time ?? 0),
                0,
              );
        } catch {
          return undefined;
        }
      };
      return list.map((item) => ({
        message_id: item.message_id,
        time: item.time * 1000,
        user_id: item.user_id != null ? String(item.user_id) : undefined,
        nickname:
          (item as { nickname?: unknown }).nickname != null
            ? String((item as { nickname?: unknown }).nickname)
            : undefined,
        message: fromIcqqMessage(item.message, item.raw_message),
        source: item.source
          ? { ...(item.source as object), id: sourceIdOf(item) }
          : undefined,
      }));
    },
    recallMessage: async (messageId: string) => {
      const ok = await client.deleteMsg(messageId);
      if (!ok) throw new Error(`Failed to recall message ${messageId}`);
    },
    getMessage: async (messageId: string) => {
      const item = await client.getMsg(messageId);
      return item
        ? {
            message_id: item.message_id,
            time: item.time * 1000,
            user_id: String(item.user_id),
            sender: {
              user_id: String(item.user_id),
              nickname:
                (item.sender as { card?: string } | undefined)?.card ||
                item.sender?.nickname,
            },
            raw_message: item.raw_message,
            message: fromIcqqMessage(item.message, item.raw_message),
          }
        : null;
    },
    getForwardMessage: async (messageId: string) => {
      const msg = await client.getMsg(messageId);
      const element = (msg?.message ?? []).find(
        (item): item is Extract<MessageElem, { resid: string }> =>
          typeof item === "object" &&
          item !== null &&
          "resid" in item &&
          typeof item.resid === "string",
      );
      if (!element) return [];
      return (await client.getForwardMsg(element.resid)).map((item) => ({
        user_id: String(item.user_id),
        nickname: item.nickname,
        time: item.time * 1000,
        message: fromIcqqMessage(item.message, item.raw_message),
      }));
    },
    banMember: async (g: string, u: string, d: number) => {
      await client.setGroupBan(num(g), num(u), d);
    },
    kickMember: async (g: string, u: string, reject = false) => {
      await client.setGroupKick(num(g), num(u), reject);
    },
    setMemberCard: async (g: string, u: string, c: string) => {
      await client.setGroupCard(num(g), num(u), c);
    },
    setMemberAdmin: async (g: string, u: string, e: boolean) => {
      await client.setGroupAdmin(num(g), num(u), e);
    },
    leaveGroup: async (g: string) => {
      await client.setGroupLeave(num(g));
    },
    setGroupName: async (g: string, n: string) => {
      await client.setGroupName(num(g), n);
    },
    setGroupPortrait: async (g: string, f: string | Buffer) => {
      await client.setGroupPortrait(
        num(g),
        f as Parameters<typeof client.setGroupPortrait>[1],
      );
    },
    deleteFriend: async (userId: string) => {
      await client.deleteFriend(num(userId));
    },
    setReaction: async (
      message_id: string | number,
      emoji_id: string | number,
      set = true,
      type = 1,
    ) => {
      const { group_id, seq } = parseGroupMessageId(String(message_id));
      const group = client.pickGroup(group_id);
      const id = String(emoji_id);
      if (set === false) {
        await group.delReaction(seq, id, type);
      } else {
        await group.setReaction(seq, id, type);
      }
    },
    sendLike: async (userId: string | number, times = 1) => {
      return client.sendLike(num(userId), times);
    },
    as<T extends object = Record<string, unknown>>() {
      return this as unknown as T;
    },
  } satisfies IcqqBotBase;
  return bot;
};
