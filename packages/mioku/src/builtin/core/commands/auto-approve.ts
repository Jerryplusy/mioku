import type { MiokuContext } from "../../../runtime/mioku-context";
import type { CorePluginConfig } from "../config";
import { isPrivilegedUser } from "../access/privileged";

export function registerAutoApprove(
  ctx: MiokuContext,
  getConfig: () => CorePluginConfig,
): () => void {
  const offFriend = ctx.handle("request.friend", async (event) => {
    if (!getConfig().friend.autoApprove) {
      return;
    }

    try {
      await event.approve();
      ctx.logger.info(`已自动通过好友申请: ${event.user_id}`);
    } catch (error) {
      ctx.logger.warn(`自动通过好友申请失败: ${error}`);
    }
  });

  const offGroup = ctx.handle("request.group.invite", async (event) => {
    if (!isPrivilegedUser(event?.user_id)) {
      return;
    }

    try {
      await event.approve();
      ctx.logger.info(`已自动通过主人/管理员拉群邀请: ${event.user_id}`);
    } catch (error) {
      ctx.logger.warn(`自动通过主人/管理员拉群邀请失败: ${error}`);
    }
  });

  return () => {
    offFriend();
    offGroup();
  };
}
