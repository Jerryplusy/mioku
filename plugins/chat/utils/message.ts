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
  const hasReply = e.message?.some((seg: any) => seg.type === "reply") ?? false;

  if (e.at) {
    if (String(e.at) === String(ctx.bot.uin)) {
      return true;
    }
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

export async function isQuotingBot(e: any, ctx: MiokiContext): Promise<boolean> {
  if (!e.message) return false;
  for (const seg of e.message) {
    if (seg.type === "reply" && seg.data?.id) {
      try {
        const quotedMsg = await ctx.bot.getMsg(seg.data.id);
        if (quotedMsg && (quotedMsg as any).user_id === ctx.bot.uin) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }
  return false;
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
  const text = ctx.text(e) || "";
  if (!cfg.isMultimodal) return { text, multimodal: null };

  const parts: any[] = [];
  if (text) {
    parts.push({ type: "text", text });
  }

  if (e.message) {
    for (const seg of e.message) {
      if (seg.type === "image" && seg.data?.url) {
        parts.push({
          type: "image_url",
          image_url: { url: seg.data.url, detail: "auto" },
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
    const memberInfo = await ctx.bot.getGroupMemberInfo(
      groupId,
      ctx.bot.uin,
    );
    return (memberInfo.role as "owner" | "admin" | "member") || "member";
  } catch {
    return "member";
  }
}
