import type { BotBase } from "../../../adapter/bot";
import type { MiokuContext } from "../../../runtime/mioku-context";
import type { CorePluginConfig } from "../config";

export function registerLikeCommand(
  ctx: MiokuContext,
  getConfig: () => CorePluginConfig,
): () => void {
  return ctx.handle("message", async (event) => {
    const cfg = getConfig();
    const text = ctx.text(event)?.trim();
    if (!text || event?.user_id === event?.self_id) {
      return;
    }

    if (!cfg.likeCommand.enabled) {
      return;
    }

    const keyword = String(cfg.likeCommand.keyword || "").trim();
    if (!keyword || text !== keyword) {
      return;
    }

    const userId = event?.user_id || event?.sender?.user_id || "";
    if (!userId) {
      return;
    }

    const bot = event.bot;
    if (!bot) {
      return;
    }
    const likeTimes = Math.max(1, Number(cfg.likeCommand.likeTimes) || 10);
    const reactionEmojiId = Math.max(
      0,
      Number(cfg.likeCommand.reactionEmojiId) || 66,
    );
    const messageId = event?.message_id;

    const adapter = bot.adapter as string;

    if (adapter === "onebotv11") {
      try {
        await bot.sendApi<boolean>("send_like", {
          user_id: userId,
          times: likeTimes,
        });
      } catch (error) {
        ctx.logger.warn(`core send_like 失败: ${error}`);
      }

      if (messageId != null) {
        try {
          await bot.sendApi("set_msg_emoji_like", {
            message_id: messageId,
            emoji_id: reactionEmojiId,
            set: true,
          });
        } catch (error) {
          ctx.logger.warn(`core set_msg_emoji_like 失败: ${error}`);
        }
      }
    } else if (adapter === "icqq") {
      const icqqBot = bot as BotBase & {
        sendLike(userId: string | number, times?: number): Promise<boolean>;
      };
      try {
        await icqqBot.sendLike(userId, likeTimes);
      } catch (error) {
        ctx.logger.warn(`core sendLike 失败: ${error}`);
      }
    }
  });
}
