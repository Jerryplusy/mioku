import type { MiokiContext } from "mioki";
import type { AITool } from "../../src/core/types";
import type { ToolCallResult, KickConfirmation } from "./types";

// 踢人确认请求存储
const kickConfirmations = new Map<string, KickConfirmation>();

/** 创建群管Skills（仅管理员/群主/主人可用） */
export function createAdminTools(
  ctx: MiokiContext,
  currentGroupId: number,
  botRole: "owner" | "admin" | "member",
  requesterId: number,
  requesterRole: "owner" | "admin" | "member",
): AITool[] {
  // 检查bot是否有管理权限
  const botHasAdminPower = botRole === "owner" || botRole === "admin";
  // 检查请求者是否有权限使用群管功能
  const requesterHasPermission =
    requesterRole === "owner" ||
    requesterRole === "admin" ||
    ctx.isOwner(requesterId);

  if (!botHasAdminPower || !requesterHasPermission) {
    return [];
  }

  return [
    {
      name: "ban_member",
      description:
        "禁言群成员。需要其他管理员确认后才能执行,不要随意使用。可选时长：1分钟、5分钟、10分钟。",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "要禁言的用户QQ号" },
          duration: {
            type: "number",
            enum: [1, 5, 10],
            description: "禁言时长（分钟），可选1、5、10",
          },
          reason: { type: "string", description: "禁言原因" },
        },
        required: ["userId", "duration"],
      },
      handler: async (args: {
        userId: number;
        duration: number;
        reason?: string;
      }): Promise<ToolCallResult> => {
        // 检查目标是否为管理员
        try {
          const memberInfo = await ctx.bot.getGroupMemberInfo(
            currentGroupId,
            args.userId,
          );
          if (memberInfo.role === "owner" || memberInfo.role === "admin") {
            return { success: false, message: "不能禁言管理员或群主" };
          }
        } catch {
          return { success: false, message: "获取成员信息失败" };
        }

        const durationSeconds = args.duration * 60;
        try {
          await ctx.bot.setGroupBan(
            currentGroupId,
            args.userId,
            durationSeconds,
          );
          return {
            success: true,
            message: `已禁言 ${args.userId} ${args.duration}分钟${args.reason ? `，原因：${args.reason}` : ""}`,
          };
        } catch (error) {
          return { success: false, message: `禁言失败: ${error}` };
        }
      },
      returnToAI: false,
    },
    {
      name: "kick_member_request",
      description:
        "发起踢出群成员的请求，不要随意使用。需要其他管理员在60秒内确认才能执行。",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "要踢出的用户QQ号" },
          reason: { type: "string", description: "踢出原因" },
        },
        required: ["userId"],
      },
      handler: async (args: {
        userId: number;
        reason?: string;
      }): Promise<ToolCallResult> => {
        // 检查目标是否为管理员
        try {
          const memberInfo = await ctx.bot.getGroupMemberInfo(
            currentGroupId,
            args.userId,
          );
          if (memberInfo.role === "owner" || memberInfo.role === "admin") {
            return { success: false, message: "不能踢出管理员或群主" };
          }
        } catch {
          return { success: false, message: "获取成员信息失败" };
        }

        const confirmId = `kick:${currentGroupId}:${args.userId}:${Date.now()}`;
        const confirmation: KickConfirmation = {
          id: confirmId,
          groupId: currentGroupId,
          targetUserId: args.userId,
          requesterId,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000, // 60秒超时
          confirmed: false,
        };
        kickConfirmations.set(confirmId, confirmation);

        // 60秒后自动清理
        setTimeout(() => {
          const conf = kickConfirmations.get(confirmId);
          if (conf && !conf.confirmed) {
            kickConfirmations.delete(confirmId);
          }
        }, 60000);

        return {
          success: true,
          message: `已发起踢出 ${args.userId} 的请求${args.reason ? `，原因：${args.reason}` : ""}。等待其他管理员确认（60秒内回复"确认踢出"）`,
          data: { confirmId },
        };
      },
      returnToAI: false,
    },
    {
      name: "set_member_card",
      description: "设置群成员的群昵称",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "用户QQ号" },
          card: { type: "string", description: "新的群昵称" },
        },
        required: ["userId", "card"],
      },
      handler: async (args: {
        userId: number;
        card: string;
      }): Promise<ToolCallResult> => {
        try {
          await ctx.bot.setGroupCard(currentGroupId, args.userId, args.card);
          return {
            success: true,
            message: `已将 ${args.userId} 的群昵称设置为 ${args.card}`,
          };
        } catch (error) {
          return { success: false, message: `设置群昵称失败: ${error}` };
        }
      },
      returnToAI: false,
    },
    {
      name: "set_member_title",
      description: "设置群成员的专属头衔（仅群主可用）",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "用户QQ号" },
          title: { type: "string", description: "专属头衔" },
        },
        required: ["userId", "title"],
      },
      handler: async (args: {
        userId: number;
        title: string;
      }): Promise<ToolCallResult> => {
        if (botRole !== "owner") {
          return { success: false, message: "只有群主才能设置专属头衔" };
        }
        try {
          await ctx.bot.setGroupSpecialTitle(
            currentGroupId,
            args.userId,
            args.title,
          );
          return {
            success: true,
            message: `已将 ${args.userId} 的头衔设置为 ${args.title}`,
          };
        } catch (error) {
          return { success: false, message: `设置头衔失败: ${error}` };
        }
      },
      returnToAI: false,
    },
    {
      name: "toggle_mute_all",
      description: "开启或关闭全体禁言，不要随意使用",
      parameters: {
        type: "object",
        properties: {
          enable: {
            type: "boolean",
            description: "true开启全体禁言，false关闭",
          },
        },
        required: ["enable"],
      },
      handler: async (args: { enable: boolean }): Promise<ToolCallResult> => {
        try {
          await ctx.bot.api("set_group_whole_ban", {
            group_id: currentGroupId,
            enable: args.enable,
          });
          return {
            success: true,
            message: args.enable ? "已开启全体禁言" : "已关闭全体禁言",
          };
        } catch (error) {
          return { success: false, message: `操作失败: ${error}` };
        }
      },
      returnToAI: false,
    },
  ];
}

/** 处理踢人确认 */
export function handleKickConfirmation(
  ctx: MiokiContext,
  groupId: number,
  confirmerId: number,
  confirmerRole: "owner" | "admin" | "member",
): { found: boolean; executed: boolean; message: string } {
  // 确认者必须是管理员或群主
  if (
    confirmerRole !== "owner" &&
    confirmerRole !== "admin" &&
    !ctx.isOwner(confirmerId)
  ) {
    return { found: false, executed: false, message: "" };
  }

  // 查找待确认的踢人请求
  for (const [id, conf] of kickConfirmations) {
    if (
      conf.groupId === groupId &&
      !conf.confirmed &&
      conf.expiresAt > Date.now()
    ) {
      // 确认者不能是发起者
      if (conf.requesterId === confirmerId) {
        return { found: true, executed: false, message: "发起者不能自己确认" };
      }

      conf.confirmed = true;
      conf.confirmedBy = confirmerId;
      kickConfirmations.delete(id);

      // 执行踢出
      try {
        ctx.bot.api("set_group_kick", {
          group_id: groupId,
          user_id: conf.targetUserId,
          reject_add_request: false,
        });
        return {
          found: true,
          executed: true,
          message: `已踢出 ${conf.targetUserId}`,
        };
      } catch (error) {
        return { found: true, executed: false, message: `踢出失败: ${error}` };
      }
    }
  }

  return { found: false, executed: false, message: "" };
}

/** 清理过期的踢人确认 */
export function cleanupExpiredKickConfirmations() {
  const now = Date.now();
  for (const [id, conf] of kickConfirmations) {
    if (conf.expiresAt < now) {
      kickConfirmations.delete(id);
    }
  }
}
