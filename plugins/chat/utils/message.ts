import { logger, MiokiContext } from "mioki";
import type { ChatConfig } from "../types";

export function shouldTrigger(
  e: any,
  text: string,
  cfg: ChatConfig,
  ctx: MiokiContext,
): boolean {
  if (e.message_type === "private") return false;

  // Only check if message @s the bot (seg format: {type: "at", qq: "123456"})
  const atSeg = e.message?.find((seg: any) => seg.type === "at");
  if (atSeg && String(atSeg.qq) === String(ctx.bot.uin)) {
    return true;
  }

  return false;
}

/**
 * Check if the message quotes a bot message.
 * Returns the quoted message content if quoting bot, null otherwise.
 * Reply seg format: {type: "reply", id: "1048732276"}
 */
export async function isQuotingBot(
  e: any,
  ctx: MiokiContext,
): Promise<{ quoted: true; messageId: string; content: string } | null> {
  if (!e.message) return null;
  for (const seg of e.message) {
    if (seg.type === "reply" && seg.id) {
      try {
        const quotedMsg = await ctx.bot.getMsg(seg.id);
        if (quotedMsg && (quotedMsg as any).user_id === ctx.bot.uin) {
          // Extract text content from quoted message
          const quotedText =
            (quotedMsg as any).raw_message ||
            (quotedMsg as any).message
              ?.filter((s: any) => s.type === "text")
              .map((s: any) => s.text || "")
              .join("") ||
            "";
          return { quoted: true, messageId: seg.id, content: quotedText };
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

/**
 * Extract quoted content from a message (regardless of who was quoted).
 * Returns the quoted text and message_id, or null if no reply segment.
 */
export async function getQuotedContent(
  e: any,
  ctx: MiokiContext,
): Promise<{ messageId: string; senderName: string; content: string } | null> {
  if (!e.message) return null;
  for (const seg of e.message) {
    if (seg.type === "reply" && seg.id) {
      try {
        const quotedMsg = await ctx.bot.getMsg(seg.id);
        if (!quotedMsg) continue;
        const senderId = (quotedMsg as any).user_id;
        const senderName =
          (quotedMsg as any).sender?.card ||
          (quotedMsg as any).sender?.nickname ||
          String(senderId || "unknown");
        const content =
          (quotedMsg as any).raw_message ||
          (quotedMsg as any).message
            ?.filter((s: any) => s.type === "text")
            .map((s: any) => s.text || "")
            .join("") ||
          "";
        return { messageId: seg.id, senderName, content };
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export function isGroupAllowed(groupId: number, cfg: ChatConfig): boolean {
  if (cfg.whitelistGroups.length > 0) {
    return cfg.whitelistGroups.includes(groupId);
  }
  if (cfg.blacklistGroups.length > 0) {
    return !cfg.blacklistGroups.includes(groupId);
  }
  return true;
}

export function extractContent(
  e: any,
  cfg: ChatConfig,
  ctx: MiokiContext,
): { text: string; multimodal: any[] | null } {
  let text = ctx.text(e) || "";

  // If text is empty but user @'d the bot, describe the action
  if (!text.trim() && e.message) {
    const hasAt = e.message.some(
      (seg: any) => seg.type === "at" && String(seg.qq) === String(ctx.bot.uin),
    );
    if (hasAt) {
      text = "[@you with no text]";
    }
  }

  if (!cfg.isMultimodal) return { text, multimodal: null };

  const parts: any[] = [];
  if (text) {
    parts.push({ type: "text", text });
  }

  if (e.message) {
    for (const seg of e.message) {
      // Image seg format: {type: "image", url: "...", file: "..."}
      if (seg.type === "image" && (seg.url || seg.data?.url)) {
        parts.push({
          type: "image_url",
          image_url: { url: seg.url || seg.data.url, detail: "auto" },
        });
      } else if (seg.type === "record") {
        parts.push({ type: "text", text: "[User sent a voice message]" });
      } else if (seg.type === "video") {
        parts.push({ type: "text", text: "[User sent a video]" });
      }
    }
  }

  if (parts.length > 1 || parts.some((p) => p.type === "image_url")) {
    return { text, multimodal: parts };
  }
  return { text, multimodal: null };
}

export async function getBotRole(
  groupId: number,
  ctx: MiokiContext,
): Promise<"owner" | "admin" | "member"> {
  try {
    const memberInfo = await ctx.bot.getGroupMemberInfo(groupId, ctx.bot.uin);
    return (memberInfo.role as "owner" | "admin" | "member") || "member";
  } catch {
    return "member";
  }
}

/**
 * 从 OneBot API 获取群聊历史消息
 * 返回格式化为 ChatMessage 数组
 */
export async function getGroupHistory(
  groupId: number,
  ctx: MiokiContext,
  count: number = 100,
): Promise<
  Array<{
    userId: number;
    userName: string;
    userRole: string;
    content: string;
    messageId: number;
    timestamp: number;
  }>
> {
  try {
    // 调用 OneBot API 获取群聊历史
    const result = await (ctx.bot as any).api("get_group_msg_history", {
      group_id: String(groupId),
      message_seq: "0",
      count: Math.min(count, 200), // 最多获取200条
      reverse_order: false,
      disable_get_url: false,
      parse_mult_msg: true,
      quick_reply: false,
    });
    const messages = result?.messages || result?.data?.messages || [];
    if (!Array.isArray(messages)) {
      logger.warn("[getGroupHistory] API 返回格式异常:", result);
      return [];
    }

    const botUin = ctx.bot.uin;

    // 格式化消息
    const formatted: Array<{
      userId: number;
      userName: string;
      userRole: string;
      content: string;
      messageId: number;
      timestamp: number;
    }> = [];

    for (const msg of messages) {
      // 跳过自己的消息
      if (String(msg.user_id) === String(botUin)) {
        continue;
      }

      // 提取文本内容
      let content = "";
      if (msg.message && msg.message.length > 0) {
        // 先尝试提取所有文本段
        const textSegs = msg.message.filter((seg: any) => seg.type === "text");
        const textContent = textSegs
          .map((seg: any) => seg.data?.text || "")
          .join("")
          .trim();

        if (textContent) {
          // 有文本内容，使用文本内容
          content = textContent;
        } else {
          // 没有文本内容，显示消息类型
          const segTypes = msg.message.map((seg: any) => seg.type);
          // 只显示非 text 的类型（因为 text 为空）
          const nonTextTypes = segTypes.filter((t: string) => t !== "text");
          if (nonTextTypes.length > 0) {
            content = `[${nonTextTypes.join(", ")}]`;
          } else {
            // 只有空文本段，跳过
            continue;
          }
        }
      }

      // 跳过空消息
      if (!content.trim()) {
        continue;
      }

      formatted.push({
        userId: msg.user_id,
        userName:
          msg.sender?.card || msg.sender?.nickname || String(msg.user_id),
        userRole: msg.sender?.role || "member",
        content,
        messageId: msg.message_id,
        timestamp: msg.time ? msg.time * 1000 : Date.now(),
      });
    }

    return formatted;
  } catch (err) {
    console.error("获取群聊历史失败:", err);
    return [];
  }
}
