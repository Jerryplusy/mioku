import { wait } from "../../../utils";
import { createGroupRef } from "../../../capabilities";
import type { MiokuContext } from "../../../runtime/mioku-context";
import type { CorePluginConfig } from "../config";
import { isPrivilegedUser } from "../access/privileged";

export function registerMinMemberCheck(
  ctx: MiokuContext,
  getConfig: () => CorePluginConfig,
): () => void {
  return ctx.handle("notice.group.increase", async (event) => {
    const cfg = getConfig();
    const selfId = String(event?.self_id || ctx.self_id || "");
    const groupId = event?.group_id ?? "";
    const userId = event?.user_id ?? "";
    if (!groupId || !userId) return;
    if (userId !== selfId) return;

    if (
      (event?.raw as { action_type?: string } | undefined)?.action_type === "invite" &&
      isPrivilegedUser(event?.operator_id)
    ) {
      ctx.logger.info(`群 ${groupId} 由主人/管理员邀请加入，跳过入群限制检查`);
      return;
    }

    const minMemberCount = Math.max(0, Number(cfg.group.minMemberCount) || 0);
    if (minMemberCount <= 0) return;

    const bot = ctx.pickBot(selfId);
    if (!bot) return;

    try {
      await wait(1000);
      const groupRef = createGroupRef(bot, groupId);
      const groupInfo = await groupRef.getInfo();
      const memberCount = Number(groupInfo?.member_count || 0);
      if (memberCount > 0 && memberCount < minMemberCount) {
        await groupRef.leave(false);
        ctx.logger.info(
          `群 ${groupId} 人数 ${memberCount} 低于限制 ${minMemberCount}，已自动退群`,
        );
      }
    } catch (error) {
      ctx.logger.warn(`入群人数检查失败: ${error}`);
    }
  });
}
