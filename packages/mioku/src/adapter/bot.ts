import type { CapabilityRegistry } from "./registry";
import type { CapabilityTarget } from "./types";
import type { Capability } from "./capability";
import type {
  MessageInput,
  MessageTarget,
  PlatformId,
  SentMessage,
} from "./message";
import { toId } from "./message";

import {
  messageRecall,
  messageGet,
  messageGetForward,
  forwardSend,
  memberBan,
  memberKick,
  memberSetCard,
  memberSetAdmin,
  memberGetInfo,
  memberPoke,
  memberSetTitle,
  groupGetInfo,
  groupGetMembers,
  groupGetList,
  groupLeave,
  groupSetName,
  groupSetWholeBan,
  groupSetPortrait,
  friendGetInfo,
  friendGetList,
  friendDelete,
  profileSet,
  avatarSet,
  conversationGetHistory,
  botStatus,
  ForwardNode,
  ForwardSendNode,
  ForwardSendOptions,
  MessageGetResult,
  MemberInfo,
  GroupInfo,
  FriendInfo,
  HistoryMessage,
  ProfileSetRequest,
  BotStatusResult,
} from "../capabilities";

export interface BotBase {
  readonly bot_id: string;
  readonly adapter: string;
  readonly nickname?: string;
  readonly online: boolean;
  readonly connected_at?: number;

  // —— 消息 ——
  sendMessage(
    target: MessageTarget,
    message: MessageInput,
  ): Promise<SentMessage>;
  sendGroupMsg(
    group_id: PlatformId,
    message: MessageInput,
  ): Promise<SentMessage>;
  sendPrivateMsg(
    user_id: PlatformId,
    message: MessageInput,
  ): Promise<SentMessage>;
  recallMessage(message_id: PlatformId): Promise<void>;
  getMessage(message_id: PlatformId): Promise<MessageGetResult | null>;
  getForwardMessage(message_id: PlatformId): Promise<ForwardNode[]>;
  sendForward(
    target: MessageTarget,
    nodes: readonly ForwardSendNode[],
    options?: ForwardSendOptions,
  ): Promise<SentMessage>;

  // —— 群 / 成员 ——
  getGroupInfo(group_id: PlatformId): Promise<GroupInfo | null>;
  getGroupList(): Promise<GroupInfo[]>;
  getGroupMembers(group_id: PlatformId): Promise<MemberInfo[]>;
  getMemberInfo(
    group_id: PlatformId,
    user_id: PlatformId,
  ): Promise<MemberInfo | null>;
  /** duration 单位为秒，0 = 解除禁言 */
  banMember(
    group_id: PlatformId,
    user_id: PlatformId,
    duration: number,
  ): Promise<void>;
  kickMember(
    group_id: PlatformId,
    user_id: PlatformId,
    reject_add_request?: boolean,
  ): Promise<void>;
  setMemberCard(
    group_id: PlatformId,
    user_id: PlatformId,
    card: string,
  ): Promise<void>;
  setMemberAdmin(
    group_id: PlatformId,
    user_id: PlatformId,
    enable: boolean,
  ): Promise<void>;
  setMemberTitle(
    group_id: PlatformId,
    user_id: PlatformId,
    title: string,
  ): Promise<void>;
  pokeMember(group_id: PlatformId, user_id: PlatformId): Promise<void>;
  setGroupName(group_id: PlatformId, group_name: string): Promise<void>;
  setGroupWholeBan(group_id: PlatformId, enable: boolean): Promise<void>;
  setGroupPortrait(group_id: PlatformId, file: string): Promise<void>;
  leaveGroup(group_id: PlatformId, is_dismiss?: boolean): Promise<void>;

  // —— 好友 ——
  getFriendInfo(user_id: PlatformId): Promise<FriendInfo | null>;
  getFriendList(): Promise<FriendInfo[]>;
  deleteFriend(user_id: PlatformId): Promise<void>;

  // —— 资料 / 会话 / 状态 ——
  setProfile(profile: ProfileSetRequest): Promise<void>;
  setAvatar(file: string): Promise<void>;
  getHistory(
    target: MessageTarget,
    before?: string,
    limit?: number,
    extra?: Record<string, unknown>,
  ): Promise<HistoryMessage[]>;
  getStatus(): Promise<BotStatusResult>;
  sendApi<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  as<T extends object = Record<string, unknown>>(): T;
}

export type BotProvidedKeys =
  | "bot_id"
  | "adapter"
  | "nickname"
  | "online"
  | "connected_at"
  | "sendMessage"
  | "sendApi"
  | "as";

export type BotAutoFilled = Exclude<keyof BotBase, BotProvidedKeys>;

export type AdapterBotBase<B extends BotBase> = Omit<B, BotAutoFilled> &
  Partial<Pick<B, BotAutoFilled>>;

export interface AdapterBotMap {}

export type Bot = AdapterBotMap[keyof AdapterBotMap] extends never
  ? BotBase
  : AdapterBotMap[keyof AdapterBotMap];

export interface BotContext {
  readonly bot: Bot;
  unregister(): void;
}

const bindDefault = <B extends object>(
  bot: B,
  name: string,
  value: unknown,
): void => {
  if (!(name in bot)) {
    Object.defineProperty(bot, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
};

export const bindCapabilities = <B extends object>(
  bot: B,
  registry: CapabilityRegistry,
): B & BotBase => {
  const target: CapabilityTarget = {
    adapter: (bot as BotBase).adapter,
    bot_id: (bot as BotBase).bot_id,
  };
  const call = async <I, O>(
    capability: Capability<I, O>,
    input: I,
  ): Promise<O> => registry.invoke(target, capability, input);

  bindDefault(
    bot,
    "as",
    <T extends object = Record<string, unknown>>() => bot as unknown as T,
  );
  bindDefault(
    bot,
    "sendGroupMsg",
    (group_id: PlatformId, message: MessageInput) =>
      (bot as BotBase).sendMessage(
        { type: "group", group_id: toId(group_id) },
        message,
      ),
  );
  bindDefault(
    bot,
    "sendPrivateMsg",
    (user_id: PlatformId, message: MessageInput) =>
      (bot as BotBase).sendMessage(
        { type: "private", user_id: toId(user_id) },
        message,
      ),
  );
  bindDefault(bot, "recallMessage", async (message_id: PlatformId) => {
    await call(messageRecall, { message_id: toId(message_id) });
  });
  bindDefault(bot, "getMessage", (message_id: PlatformId) =>
    call(messageGet, { message_id: toId(message_id) }),
  );
  bindDefault(bot, "getForwardMessage", (message_id: PlatformId) =>
    call(messageGetForward, { message_id: toId(message_id) }),
  );
  bindDefault(
    bot,
    "sendForward",
    (
      t: MessageTarget,
      nodes: readonly ForwardSendNode[],
      options?: ForwardSendOptions,
    ) =>
      call(forwardSend, {
        target: t,
        nodes,
        source: options?.source,
        news: options?.news,
        summary: options?.summary,
      }),
  );
  bindDefault(bot, "getGroupInfo", (group_id: PlatformId) =>
    call(groupGetInfo, { group_id: toId(group_id) }),
  );
  bindDefault(bot, "getGroupList", () => call(groupGetList, {}));
  bindDefault(bot, "getGroupMembers", (group_id: PlatformId) =>
    call(groupGetMembers, { group_id: toId(group_id) }),
  );
  bindDefault(
    bot,
    "getMemberInfo",
    (group_id: PlatformId, user_id: PlatformId) =>
      call(memberGetInfo, { group_id: toId(group_id), user_id: toId(user_id) }),
  );
  bindDefault(
    bot,
    "banMember",
    (group_id: PlatformId, user_id: PlatformId, duration: number) =>
      call(memberBan, {
        group_id: toId(group_id),
        user_id: toId(user_id),
        duration,
      }),
  );
  bindDefault(
    bot,
    "kickMember",
    (group_id: PlatformId, user_id: PlatformId, reject_add_request?: boolean) =>
      call(memberKick, {
        group_id: toId(group_id),
        user_id: toId(user_id),
        reject_add_request: reject_add_request,
      }),
  );
  bindDefault(
    bot,
    "setMemberCard",
    (group_id: PlatformId, user_id: PlatformId, card: string) =>
      call(memberSetCard, {
        group_id: toId(group_id),
        user_id: toId(user_id),
        card,
      }),
  );
  bindDefault(
    bot,
    "setMemberAdmin",
    (group_id: PlatformId, user_id: PlatformId, enable: boolean) =>
      call(memberSetAdmin, {
        group_id: toId(group_id),
        user_id: toId(user_id),
        enable,
      }),
  );
  bindDefault(
    bot,
    "setMemberTitle",
    (group_id: PlatformId, user_id: PlatformId, title: string) =>
      call(memberSetTitle, {
        group_id: toId(group_id),
        user_id: toId(user_id),
        title,
      }),
  );
  bindDefault(bot, "pokeMember", (group_id: PlatformId, user_id: PlatformId) =>
    call(memberPoke, { group_id: toId(group_id), user_id: toId(user_id) }),
  );
  bindDefault(bot, "setGroupName", (group_id: PlatformId, group_name: string) =>
    call(groupSetName, { group_id: toId(group_id), group_name }),
  );
  bindDefault(
    bot,
    "setGroupWholeBan",
    (group_id: PlatformId, enable: boolean) =>
      call(groupSetWholeBan, { group_id: toId(group_id), enable }),
  );
  bindDefault(bot, "setGroupPortrait", (group_id: PlatformId, file: string) =>
    call(groupSetPortrait, { group_id: toId(group_id), file }),
  );
  bindDefault(bot, "leaveGroup", (group_id: PlatformId, is_dismiss?: boolean) =>
    call(groupLeave, { group_id: toId(group_id), is_dismiss }),
  );
  bindDefault(bot, "getFriendInfo", (user_id: PlatformId) =>
    call(friendGetInfo, { user_id: toId(user_id) }),
  );
  bindDefault(bot, "getFriendList", () => call(friendGetList, {}));
  bindDefault(bot, "deleteFriend", (user_id: PlatformId) =>
    call(friendDelete, { user_id: toId(user_id) }),
  );
  bindDefault(bot, "setProfile", (profile: ProfileSetRequest) =>
    call(profileSet, profile),
  );
  bindDefault(bot, "setAvatar", (file: string) => call(avatarSet, { file }));
  bindDefault(
    bot,
    "getHistory",
    (
      t: MessageTarget,
      before?: string,
      limit?: number,
      extra?: Record<string, unknown>,
    ) => call(conversationGetHistory, { target: t, before, limit, extra }),
  );
  bindDefault(bot, "getStatus", () => call(botStatus, {}));

  return bot as B & BotBase;
};
