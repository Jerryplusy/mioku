import type { MiokiContext } from "mioki";
import type { ChatConfig } from "../types";

export function shouldTrigger(
  e: any,
  text: string,
  cfg: ChatConfig,
  ctx: MiokiContext,
): boolean {
  if (e.message_type === "private") return false;

  // Check if message contains a reply segment
  const hasReply =
    e.message?.some((seg: any) => seg.type === "reply") ?? false;

  // Check if message @s the bot (seg format: {type: "at", qq: "123456"})
  const atSeg = e.message?.find((seg: any) => seg.type === "at");
  if (atSeg && String(atSeg.qq) === String(ctx.bot.uin)) {
    return true;
  }

  // If message is a reply but didn't @ bot, don't trigger here
  // (quote-bot detection is handled separately in index.ts via isQuotingBot)
  if (hasReply) {
    return false;
  }

  if (cfg.nicknames.length > 0) {
    const lowerText = text.toLowerCase();
    for (const nick of cfg.nicknames) {
      if (lowerText.includes(nick.toLowerCase())) {
        return true;
      }
    }
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
