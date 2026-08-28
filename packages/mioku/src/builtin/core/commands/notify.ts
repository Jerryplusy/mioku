import type { MiokuContext } from "../../../runtime/mioku-context";

const FORWARD_LINE_LIMIT = 50;
const LINES_PER_NODE = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function replyText(event: any, text: string): Promise<void> {
  return event.reply(text, true);
}

export async function sendTextOrForward(options: {
  ctx: MiokuContext;
  event: any;
  text: string;
  source: string;
  summary?: string;
}): Promise<void> {
  const { ctx, event, text, source, summary } = options;
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length <= FORWARD_LINE_LIMIT) {
    await replyText(event, text);
    return;
  }

  const selfId = String(event?.self_id || "");
  const bot = ctx.pickBot(selfId);
  if (!bot) {
    await replyText(event, text);
    return;
  }

  const messages = chunk(lines, LINES_PER_NODE).map((chunkLines, idx) => ({
    type: "node",
    data: {
      user_id: selfId,
      nickname: `第${idx + 1}条`,
      content: [ctx.segment.text(chunkLines.join("\n"))],
    },
  }));

  try {
    if (event?.message_type === "group" && event?.group_id) {
      await bot.sendApi("send_group_forward_msg", {
        group_id: event.group_id,
        messages,
        source,
        summary,
      });
    } else if (event?.user_id) {
      await bot.sendApi("send_private_forward_msg", {
        user_id: event.user_id,
        messages,
        source,
        summary,
      });
    }
  } catch (error) {
    ctx.logger.error(`[core] 发送转发消息失败: ${error}`);
    await replyText(event, text);
  }
}
