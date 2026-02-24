import { MiokiContext } from "mioki";
import { parseLineMarkers } from "../utils/queue";

/**
 * 发送单条消息（带 markers 解析）
 */
export async function sendMessage(
  ctx: MiokiContext,
  groupId: number | undefined,
  userId: number,
  text: string,
  isFirst: boolean,
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

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];

      // 解析消息中的标记
      const { cleanText, atUsers, pokeUsers, quoteId } = parseLineMarkers(
        line,
        isFirst && j === 0 ? undefined : "skip",
      );

      // 戳人
      if (groupId && pokeUsers.length > 0) {
        for (const pokeId of pokeUsers) {
          await ctx.bot.api("group_poke", {
            group_id: groupId,
            user_id: pokeId,
          });
        }
      }

      // @ 某人
      if (groupId && atUsers.length > 0) {
        for (const atId of atUsers) {
          // @ 机器人自己，不处理
          if (String(atId) === String(ctx.bot.uin)) continue;
          // 构建回复
          const atMsg = [ctx.segment.at(atId), ctx.segment.text(cleanText)];
          if (isFirst && j === 0 && quoteId) {
            atMsg.unshift(ctx.segment.reply(String(quoteId)));
          }
          await ctx.bot.sendGroupMsg(groupId, atMsg);
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // 普通文本消息
      if (cleanText) {
        let sendMsg: any = cleanText;
        if (isFirst && j === 0 && quoteId) {
          sendMsg = [ctx.segment.reply(String(quoteId)), cleanText];
        }
        if (groupId) {
          await ctx.bot.sendGroupMsg(groupId, sendMsg);
        } else if (userId) {
          await ctx.bot.sendPrivateMsg(userId, sendMsg);
        }
      }

      if (j < lines.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } catch (err) {
    ctx.logger.error("[sendMessage] error:", err);
  }
}
