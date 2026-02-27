import { MiokiContext } from "mioki";
import { parseLineMarkers, splitByReplyMarkers } from "../utils/queue";

/**
 * 发送单条消息（带 markers 解析）
 */
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
