import type { MiokiContext } from "mioki";
import type { MessageContext, MessageSegment, ChatConfig } from "./types";
import type { MultimodalContentItem } from "../../src/services/ai";

/** 解析消息事件为上下文 */
export async function parseMessageContext(
  ctx: MiokiContext,
  e: any,
  config: ChatConfig,
): Promise<MessageContext | null> {
  if (!ctx.isGroupMsg(e)) return null;

  const groupId = e.group_id;
  const userId = e.sender?.user_id ?? e.user_id;
  const messageId = e.message_id?.toString() ?? "";

  // 获取群信息
  let groupName = "";
  let groupMemberCount = 0;
  try {
    const groupInfo = await ctx.bot.getGroupInfo(groupId);
    groupName = groupInfo.group_name ?? "";
    groupMemberCount = groupInfo.member_count ?? 0;
  } catch {}

  // 解析消息段
  const segments: MessageSegment[] = [];
  const message = e.message ?? [];
  let isAtBot = false;
  let isQuoteBot = false;
  let hasNickname = false;

  const botQQ = ctx.bot.uin;
  const rawText = ctx.text(e) ?? "";

  // 检查是否包含昵称
  for (const nick of config.nicknames) {
    if (rawText.includes(nick)) {
      hasNickname = true;
      break;
    }
  }

  for (const seg of message) {
    switch (seg.type) {
      case "text":
        segments.push({ type: "text", data: { text: (seg as any).text ?? "" } });
        break;
      case "image":
        segments.push({ type: "image", data: { url: (seg as any).url ?? "" } });
        break;
      case "video":
        segments.push({ type: "video", data: { url: (seg as any).url ?? "" } });
        break;
      case "record":
        segments.push({ type: "audio", data: { url: (seg as any).url ?? "" } });
        break;
      case "at":
        const atQQ = (seg as any).qq;
        // 类型转换确保比较正确（qq可能是字符串或数字）
        if (String(atQQ) === String(botQQ) || atQQ === "all") {
          isAtBot = true;
        }
        segments.push({ type: "at", data: { qq: atQQ } });
        break;
      case "reply":
        const replyId = (seg as any).id;
        segments.push({ type: "quote", data: { messageId: replyId } });
        // 检查引用的是否是bot的消息
        try {
          const replyMsg = await ctx.bot.getMsg(replyId);
          if (replyMsg && replyMsg.sender?.user_id === botQQ) {
            isQuoteBot = true;
          }
        } catch {}
        break;
    }
  }

  // 确定用户角色
  let userRole: "owner" | "admin" | "member" = "member";
  try {
    const memberInfo = await ctx.bot.getGroupMemberInfo(groupId, userId);
    userRole = memberInfo.role as "owner" | "admin" | "member";
  } catch {}

  return {
    messageId,
    groupId,
    groupName,
    groupMemberCount,
    userId,
    userNickname: e.sender?.nickname ?? "",
    userCard: e.sender?.card ?? "",
    userTitle: (e.sender as any)?.title ?? "",
    userRole,
    isAtBot,
    isQuoteBot,
    hasNickname,
    timestamp: e.time ? e.time * 1000 : Date.now(),
    rawMessage: rawText,
    segments,
  };
}

/** 检查是否应该触发AI */
export function shouldTriggerAI(msgCtx: MessageContext): boolean {
  return msgCtx.isAtBot || msgCtx.isQuoteBot || msgCtx.hasNickname;
}

/** 将消息段转换为多模态内容 */
export async function segmentsToMultimodal(
  segments: MessageSegment[],
  isMultimodal: boolean,
): Promise<string | MultimodalContentItem[]> {
  if (!isMultimodal) {
    // 纯文本模式，只提取文本
    return segments
      .filter(s => s.type === "text")
      .map(s => s.data.text ?? "")
      .join("");
  }

  const content: MultimodalContentItem[] = [];

  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        if (seg.data.text) {
          content.push({ type: "text", text: seg.data.text });
        }
        break;
      case "image":
        if (seg.data.url) {
          content.push({
            type: "image_url",
            image_url: { url: seg.data.url, detail: "auto" },
          });
        }
        break;
      case "video":
        // 视频抽帧（简化处理：取视频封面）
        if (seg.data.url) {
          content.push({ type: "text", text: "[视频内容]" });
          // 实际实现需要视频处理服务
        }
        break;
      case "audio":
        // 语音转文字（需要额外服务）
        content.push({ type: "text", text: "[语音消息]" });
        break;
      case "at":
        content.push({ type: "text", text: `@${seg.data.qq}` });
        break;
    }
  }

  return content.length > 0 ? content : "";
}

/** 格式化时间 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 格式化用户信息用于提示词 */
export function formatUserInfo(msgCtx: MessageContext): string {
  const parts = [];
  parts.push(`[${formatTime(msgCtx.timestamp)}]`);
  parts.push(`${msgCtx.userCard || msgCtx.userNickname}(${msgCtx.userId})`);
  if (msgCtx.userTitle) parts.push(`【${msgCtx.userTitle}】`);
  if (msgCtx.userRole !== "member") parts.push(`[${msgCtx.userRole === "owner" ? "群主" : "管理员"}]`);
  return parts.join(" ");
}

/** 获取群聊历史记录用于上下文 */
export async function getRecentGroupHistory(
  ctx: MiokiContext,
  groupId: number,
  count: number = 10,
): Promise<Array<{ sender: string; senderId: number; content: string; time: string; messageId: string }>> {
  try {
    const history = await ctx.bot.api("get_group_msg_history", {
      group_id: groupId,
      count,
    });
    return ((history as any).messages ?? []).map((msg: any) => ({
      sender: msg.sender?.card || msg.sender?.nickname || String(msg.sender?.user_id),
      senderId: msg.sender?.user_id,
      content: msg.raw_message,
      time: formatTime(msg.time * 1000),
      messageId: String(msg.message_id ?? ""),
    }));
  } catch {
    return [];
  }
}
