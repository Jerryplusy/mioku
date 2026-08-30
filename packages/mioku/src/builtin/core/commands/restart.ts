import { isEventOwner } from "../../../runtime/mioku-context";
import type { MiokuContext } from "../../../runtime/mioku-context";
import { replyText } from "./notify";
import { getCommandPrefix } from "./prefix";
import {
  formatUptime,
  triggerRestart,
  type RestartMarker,
} from "../system/restart";

export function registerRestartCommand(ctx: MiokuContext): () => void {
  const dispose = ctx.handle("message", async (event) => {
    const text = ctx.text(event)?.trim();
    if (!text || event?.user_id === event?.self_id) return;
    const prefix = getCommandPrefix();
    if (text !== `${prefix}restart` && text !== `${prefix}重启`) return;

    if (!isEventOwner(event)) {
      ctx.logger.warn("[core] restart 指令仅主人可用");
      return;
    }

    const uptimeMs = process.uptime() * 1000;
    const selfId = Number(event?.self_id || 0);
    const groupId =
      event?.message_type === "group" && event?.group_id
        ? Number(event.group_id)
        : null;
    const userId = Number(event?.user_id || 0);

    const marker: RestartMarker = {
      initiatedAt: Date.now(),
      selfId,
      groupId,
      userId,
    };

    try {
      await replyText(event, `Bot已运行${formatUptime(uptimeMs)}，正在重启...`);
    } catch (error) {
      ctx.logger.warn(`[core] 发送重启提示失败: ${error}`);
    }

    ctx.logger.info(`[core] 正在执行重启命令 ${formatUptime(uptimeMs)}`);
    triggerRestart(marker);
  });

  return dispose;
}
