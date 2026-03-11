import type { MiokiContext } from "mioki";
import type {
  ChatConfig,
  ChatMessage,
  TargetMessage,
  ToolContext,
} from "../types";
import type { ChatDatabase } from "../db";
import type { HumanizeEngine } from "../humanize";
import { parseLineMarkers, splitByReplyMarkers } from "../utils/queue";
import { getGroupHistory } from "../utils";

export interface SendAIResponseOptions {
  ctx: MiokiContext;
  groupId: number;
  messages: string[];
  sentIndices?: Set<number>;
  typoGenerator: { apply: (text: string) => string };
  onLineSent?: () => void | Promise<void>;
}

export async function sendAIResponse(
  options: SendAIResponseOptions,
  e: any,
): Promise<void> {
  const { ctx, groupId, messages, sentIndices, typoGenerator, onLineSent } =
    options;

  if (messages.length === 0) return;

  for (let i = 0; i < messages.length; i++) {
    if (sentIndices?.has(i)) continue;

    let msg = messages[i];
    msg = typoGenerator.apply(msg);

    const lines = msg.split("\n").filter((l) => l.trim());

    const expandedLines: string[] = [];
    for (const line of lines) {
      const parts = splitByReplyMarkers(line);
      expandedLines.push(...parts);
    }

    let pendingReply: number | undefined;

    for (let j = 0; j < expandedLines.length; j++) {
      const line = expandedLines[j];

      const { cleanText, atUsers, pokeUsers, quoteId } = parseLineMarkers(line);

      if (quoteId !== undefined) {
        pendingReply = quoteId;
      }

      const hasContent = cleanText && cleanText.trim().length > 0;
      const isLastLine = j === expandedLines.length - 1;

      if (!hasContent && !isLastLine) {
        continue;
      }

      if (pokeUsers.length > 0) {
        for (const pokeId of pokeUsers) {
          await ctx.pickBot(e.self_id).api("group_poke", {
            group_id: groupId,
            user_id: pokeId,
          });
        }
      }

      const lineSegments: any[] = [];

      const finalQuoteId = pendingReply;
      if (finalQuoteId !== undefined) {
        lineSegments.push({ type: "reply", id: String(finalQuoteId) });
        pendingReply = undefined;
      }

      for (const atId of atUsers) {
        lineSegments.push(ctx.segment.at(atId));
      }

      if (cleanText) {
        lineSegments.push(ctx.segment.text(cleanText));
      }

      if (lineSegments.length > 0) {
        await ctx.pickBot(e.self_id).sendGroupMsg(groupId, lineSegments);
      }

      if (j < expandedLines.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (i < messages.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }

    await onLineSent?.();
  }
}

export async function sendMessage(
  ctx: MiokiContext,
  groupId: number | undefined,
  userId: number,
  text: string,
  typoGenerator: {
    apply: (text: string) => string;
  },
  e: any,
): Promise<void> {
  try {
    // 应用错别字生成器
    let msg = typoGenerator.apply(text);

    // 按换行符分割为多条消息
    let lines: string[];
    lines = msg.split("\n").filter((l) => l.trim());

    // 展开包含多个 reply 标记的行
    const expandedLines: string[] = [];
    for (const line of lines) {
      const parts = splitByReplyMarkers(line);
      expandedLines.push(...parts);
    }

    let pendingReply: number | undefined;

    for (let j = 0; j < expandedLines.length; j++) {
      const line = expandedLines[j];

      const { cleanText, atUsers, pokeUsers, quoteId } = parseLineMarkers(line);

      if (quoteId !== undefined) {
        pendingReply = quoteId;
      }

      const hasContent = cleanText && cleanText.trim().length > 0;
      const isLastLine = j === expandedLines.length - 1;

      if (!hasContent && !isLastLine) {
        continue;
      }

      // 戳人 - 立即执行
      if (groupId && pokeUsers.length > 0) {
        for (const pokeId of pokeUsers) {
          await ctx.pickBot(e.self_id).api("group_poke", {
            group_id: groupId,
            user_id: pokeId,
          });
        }
      }

      const hasAt = atUsers.length > 0;

      if (hasAt) {
        const segments: any[] = [];
        if (pendingReply !== undefined) {
          segments.push({ type: "reply", id: String(pendingReply) });
          pendingReply = undefined;
        }
        // 有 @ 用户时，构建消息保持原始位置
        // 先将原始行按 @ 标记分割，然后重新构建
        let remaining = line;
        // 支持三种格式: [[[at:xxx]]], (((at:xxx))), (((xxx)))
        const atPatterns = [
          /\[\[\[at:(\d+)\]\]\]/g,
          /\(\(\(at:(\d+)\)\)\)/g,
          /\(\(\((\d+)\)\)\)/g,
        ];

        let lastIndex = 0;
        let match;

        // 依次处理每种格式
        for (const atPattern of atPatterns) {
          atPattern.lastIndex = 0; // 重置正则
          while ((match = atPattern.exec(remaining)) !== null) {
            // 添加 @ 之前的文本
            const beforeAt = remaining.slice(lastIndex, match.index);
            if (beforeAt) {
              // 清理 reply 和 poke 标记残留
              const cleaned = beforeAt
                .replace(/\[\[\[reply:\d+\]\]\]/g, "")
                .replace(/\(\(\(reply:\d+\)\)\)/g, "")
                .replace(/\[\[\[poke:\d+\]\]\]/g, "")
                .replace(/\(\(\(poke:\d+\)\)\)/g, "")
                .trim();
              if (cleaned) {
                segments.push({ type: "text", text: cleaned });
              }
            }

            const atId = match[1];
            // 跳过 @ 机器人自己的情况
            if (String(atId) !== String(e.self_id)) {
              segments.push(ctx.segment.at(atId));
            }

            lastIndex = match.index + match[0].length;
          }
        }

        // 添加 @ 之后的文本
        const afterAt = remaining.slice(lastIndex);
        if (afterAt) {
          const cleaned = afterAt
            .replace(/\[\[\[reply:\d+\]\]\]/g, "")
            .replace(/\(\(\(reply:\d+\)\)\)/g, "")
            .replace(/\[\[\[poke:\d+\]\]\]/g, "")
            .replace(/\(\(\(poke:\d+\)\)\)/g, "")
            .trim();
          if (cleaned) {
            segments.push({ type: "text", text: cleaned });
          }
        }

        // 发送消息
        if (segments.length > 0) {
          if (groupId) {
            await ctx.pickBot(e.self_id).sendGroupMsg(groupId, segments);
          }
        }
      } else {
        // 没有 @ 用户时，发送普通文本消息
        if (cleanText || pendingReply !== undefined) {
          const sendSegments: any[] = [];
          if (pendingReply !== undefined) {
            sendSegments.push({ type: "reply", id: String(pendingReply) });
            pendingReply = undefined;
          }
          if (cleanText) {
            sendSegments.push(ctx.segment.text(cleanText));
          }
          if (sendSegments.length > 0) {
            if (groupId) {
              await ctx.pickBot(e.self_id).sendGroupMsg(groupId, sendSegments);
            } else if (userId) {
              await ctx.pickBot(e.self_id).sendPrivateMsg(userId, sendSegments);
            }
          }
        }
      }

      if (j < expandedLines.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } catch (err) {
    ctx.logger.error("[sendMessage] error:", err);
  }
}

export interface GroupHistoryResult {
  history: ChatMessage[];
  rawHistory: Awaited<ReturnType<typeof getGroupHistory>>;
}

export async function getGroupHistoryMessages(
  groupId: number,
  groupSessionId: string,
  ctx: MiokiContext,
  historyCount: number,
  db: ChatDatabase,
  e: any,
): Promise<GroupHistoryResult> {
  const rawHistory = await getGroupHistory(groupId, ctx, historyCount, db, e);
  const history: ChatMessage[] = rawHistory.map((msg) => ({
    sessionId: groupSessionId,
    role: "user" as const,
    content: msg.content,
    userId: msg.userId,
    userName: msg.userName,
    userRole: msg.userRole,
    groupId,
    timestamp: msg.timestamp,
    messageId: msg.messageId,
  }));

  return { history, rawHistory };
}

export interface GroupInfoResult {
  groupName: string | undefined;
  memberCount: number | undefined;
}

export async function getGroupInfoData(
  ctx: MiokiContext,
  groupId: number,
  fallbackGroupName?: string,
  e: any,
): Promise<GroupInfoResult> {
  let groupName: string | undefined;
  let memberCount: number | undefined;

  try {
    const groupInfo = await ctx.pickBot(e.self_id).getGroupInfo(groupId);
    groupName = (groupInfo as any)?.group_name || fallbackGroupName;
    memberCount = (groupInfo as any)?.member_count;
  } catch {
    groupName = fallbackGroupName;
  }

  return { groupName, memberCount };
}

export interface HumanizeContextsResult {
  memoryContext: string | undefined;
  topicContext: string | undefined;
  expressionContext: string | undefined;
}

export async function getHumanizeContexts(
  humanize: HumanizeEngine,
  groupSessionId: string,
  content: string,
  userName: string,
  history: ChatMessage[],
): Promise<HumanizeContextsResult> {
  const memoryContext = await humanize.memoryRetrieval.retrieve(
    groupSessionId,
    content,
    userName,
    history,
  );

  const topicContext = humanize.topicTracker.getTopicContext(groupSessionId);
  const expressionContext =
    humanize.expressionLearner.getExpressionContext(groupSessionId);

  return {
    memoryContext: memoryContext || undefined,
    topicContext: topicContext || undefined,
    expressionContext: expressionContext || undefined,
  };
}

export interface BuildToolContextOptions {
  ctx: MiokiContext;
  event: any;
  groupSessionId: string;
  groupId?: number;
  userId: number;
  config: ChatConfig;
  aiService: AIService;
  db: ChatDatabase;
  botRole: "owner" | "admin" | "member";
  pendingImageUrls?: string[];
  humanize: HumanizeEngine;
  targetMessage: TargetMessage;
}

export function buildToolContext(
  options: BuildToolContextOptions,
): ToolContext {
  const {
    ctx,
    event,
    groupSessionId,
    groupId,
    userId,
    config,
    aiService,
    db,
    botRole,
    pendingImageUrls,
    humanize,
    targetMessage,
  } = options;

  return {
    ctx,
    event,
    sessionId: groupSessionId,
    groupId,
    userId,
    config,
    aiService,
    db,
    botRole,
    pendingImageUrls,
    onTextContent: async (text, messageIndex) => {
      const messages = text
        .trim()
        .split("\n---\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (messages[messageIndex]) {
        await sendMessage(
          ctx,
          groupId,
          targetMessage.userId,
          messages[messageIndex],
          humanize.typoGenerator,
          event,
        );
      }
    },
  };
}

export function saveBotMessages(
  groupId: number,
  groupSessionId: string,
  messages: string[],
  timestamp: number,
  config: ChatConfig,
  db: ChatDatabase,
  ctx: MiokiContext,
  groupLastBotMessageTime: Map<string, number>,
  groupMessageCountAfterBot: Map<string, number>,
  e: any,
): void {
  const botNickname =
    config.nicknames[0] || ctx.pickBot(e.self_id).nickname || "Miku";

  for (const msg of messages) {
    const botMsg: ChatMessage = {
      sessionId: groupSessionId,
      role: "assistant",
      content: msg,
      userId: e.self_id,
      userName: botNickname,
      userRole: "member",
      groupId,
      timestamp,
    };
    db.saveMessage(botMsg);
  }

  groupLastBotMessageTime.set(groupSessionId, timestamp);
  groupMessageCountAfterBot.set(groupSessionId, 0);
}

export async function sendEmoji(
  ctx: MiokiContext,
  groupId: number,
  emojiPath: string | null | undefined,
  e: any,
): Promise<void> {
  if (!emojiPath) return;

  try {
    const emojiSegment = ctx.segment.image(`file://${emojiPath}`);
    await ctx.pickBot(e.self_id).sendGroupMsg(groupId, [emojiSegment]);
  } catch (err) {
    try {
      const fsPromises = await import("fs/promises");
      const path = await import("path");

      let fileExists = false;
      try {
        await fsPromises.access(emojiPath);
        fileExists = true;
      } catch {
        fileExists = false;
      }

      if (!fileExists) {
        ctx.logger.warn(`[Emoji] File not found: ${emojiPath}`);
        return;
      }

      const buffer = await fsPromises.readFile(emojiPath);
      const base64 = buffer.toString("base64");
      const ext = path.extname(emojiPath).toLowerCase();
      const mimeType =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".png"
            ? "image/png"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".webp"
                ? "image/webp"
                : "image/jpeg";

      const base64DataUrl = `data:${mimeType};base64,${base64}`;
      const base64Segment = ctx.segment.image(base64DataUrl);
      await ctx.pickBot(e.self_id).sendGroupMsg(groupId, [base64Segment]);
      ctx.logger.info(`[Emoji] Sent via base64: ${path.basename(emojiPath)}`);
    } catch (base64Err) {
      ctx.logger.error(`[Emoji] Base64 also failed: ${base64Err}`);
    }
  }
}
