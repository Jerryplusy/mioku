import type { MiokiContext } from "mioki";
import type {
  ChatConfig,
  ChatMessage,
  TargetMessage,
  ToolContext,
} from "../types";
import type { ChatDatabase } from "../db";
import type { HumanizeEngine } from "../humanize";
import type { SkillSessionManager } from "../manage/skill-session";
import { parseLineMarkers, splitByReplyMarkers } from "../utils/queue";
import { getGroupHistory } from "../utils";
import { runChat } from "./chat-engine";

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

    for (let j = 0; j < expandedLines.length; j++) {
      const line = expandedLines[j];

      const { cleanText, atUsers, pokeUsers, quoteId } = parseLineMarkers(line);

      if (pokeUsers.length > 0) {
        for (const pokeId of pokeUsers) {
          await ctx.bot.api("group_poke", {
            group_id: groupId,
            user_id: pokeId,
          });
        }
      }

      const lineSegments: any[] = [];

      if (quoteId !== undefined) {
        lineSegments.push({ type: "reply", id: String(quoteId) });
      }

      for (const atId of atUsers) {
        lineSegments.push(ctx.segment.at(atId));
      }

      if (cleanText) {
        lineSegments.push(ctx.segment.text(cleanText));
      }

      if (lineSegments.length > 0) {
        await ctx.bot.sendGroupMsg(groupId, lineSegments);
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

    for (let j = 0; j < expandedLines.length; j++) {
      const line = expandedLines[j];

      // 每一行都检查引用标记，不跳过
      const { cleanText, atUsers, pokeUsers, quoteId } = parseLineMarkers(line);

      // 戳人
      if (groupId && pokeUsers.length > 0) {
        for (const pokeId of pokeUsers) {
          await ctx.bot.api("group_poke", {
            group_id: groupId,
            user_id: pokeId,
          });
        }
      }

      // 构建消息段：保持 @ 在文本中的原始位置
      const segments: any[] = [];

      // 如果有引用标记就添加，不限制只能第一条消息
      if (quoteId !== undefined) {
        segments.push({ type: "reply", id: String(quoteId) });
      }

      if (groupId && atUsers.length > 0) {
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
            if (String(atId) !== String(ctx.bot.uin)) {
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
            await ctx.bot.sendGroupMsg(groupId, segments);
          }
        }
      } else {
        // 没有 @ 用户时，发送普通文本消息
        if (cleanText || quoteId !== undefined) {
          const sendSegments: any[] = [];
          if (quoteId !== undefined) {
            sendSegments.push({ type: "reply", id: String(quoteId) });
          }
          if (cleanText) {
            sendSegments.push(ctx.segment.text(cleanText));
          }
          if (sendSegments.length > 0) {
            if (groupId) {
              await ctx.bot.sendGroupMsg(groupId, sendSegments);
            } else if (userId) {
              await ctx.bot.sendPrivateMsg(userId, sendSegments);
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
): Promise<GroupHistoryResult> {
  const rawHistory = await getGroupHistory(groupId, ctx, historyCount, db);
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
): Promise<GroupInfoResult> {
  let groupName: string | undefined;
  let memberCount: number | undefined;

  try {
    const groupInfo = await ctx.bot.getGroupInfo(groupId);
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
  hasAttachedImages?: boolean;
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
    hasAttachedImages,
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
    hasAttachedImages,
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
): void {
  const botNickname = config.nicknames[0] || ctx.bot.nickname || "Miku";

  for (const msg of messages) {
    const botMsg: ChatMessage = {
      sessionId: groupSessionId,
      role: "assistant",
      content: msg,
      userId: ctx.bot.uin,
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
): Promise<void> {
  if (!emojiPath) return;

  try {
    const emojiSegment = ctx.segment.image(`file://${emojiPath}`);
    await ctx.bot.sendGroupMsg(groupId, [emojiSegment]);
  } catch (err) {
    ctx.logger.warn(`[Emoji] Failed to send: ${err}`);
  }
}
