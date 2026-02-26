import { getQuoteImageUrl, logger } from "mioki";
import type { AITool } from "../../../src";
import type { SkillSession, ToolContext } from "../types";

interface CreateToolsResult {
  tools: AITool[];
}

export interface SkillSessionManager {
  getTools(sessionId: string): Map<string, AITool>;
  loadSkill(
    sessionId: string,
    skillName: string,
    tools: AITool[],
  ): SkillSession;
  unloadSkill(sessionId: string, skillName: string): boolean;
  getActiveSkillsInfo(sessionId: string): string;
  cleanup(): void;
}

/**
 * Create all tools
 */
export function createTools(
  toolCtx: ToolContext,
  skillManager: SkillSessionManager,
): CreateToolsResult {
  const tools: AITool[] = [];

  // === AT / Quote tools (always available) ===
  tools.push(...createMessageTools());

  // === Info query tools (always available) ===
  tools.push(...createInfoTools(toolCtx));

  // === Admin tools (conditional) ===
  if (
    toolCtx.groupId &&
    toolCtx.config.enableGroupAdmin &&
    (toolCtx.botRole === "admin" || toolCtx.botRole === "owner")
  ) {
    tools.push(...createAdminTools(toolCtx));
  }

  // === Meta tools (conditional) ===
  if (toolCtx.config.enableExternalSkills) {
    tools.push(
      createLoadSkillTool(toolCtx, skillManager),
      createUnloadSkillTool(toolCtx, skillManager),
    );
  }

  return { tools };
}

// ==================== Message Tools ====================

function createMessageTools(): AITool[] {
  return [
    {
      name: "end_session",
      description:
        "End the current conversation session immediately. Use this when the conversation is complete or you want to stop responding.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Reason for ending the session (optional)",
          },
        },
      },
      handler: async (args) => {
        return { success: true, ended: true, reason: args.reason };
      },
      returnToAI: false, // 不需要返回给 AI，直接结束
    },
  ];
}

// ==================== Info Tools ====================

function createInfoTools(toolCtx: ToolContext): AITool[] {
  const tools: AITool[] = [];

  if (toolCtx.groupId) {
    tools.push({
      name: "get_group_member_info",
      description:
        "Get detailed info about a group member,including gender, age, QQ rating, group level, group title, etc",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "QQ number of the member",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        try {
          const info = await toolCtx.ctx.bot.getGroupMemberInfo(
            toolCtx.groupId!,
            args.user_id,
          );
          return {
            nickname: info.nickname,
            card: info.card,
            sex: info.sex,
            age: info.age,
            area: info.area,
            level: info.level,
            qq_level: info.qq_level,
            title: info.title,
          };
        } catch (err) {
          return { error: `Failed to get member info: ${err}` };
        }
      },
      returnToAI: true,
    });

    tools.push({
      name: "get_group_member_list",
      description: "Get the list of group members (returns name and role only)",
      parameters: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        try {
          const list = await toolCtx.ctx.bot.getGroupMemberList(
            toolCtx.groupId!,
          );
          const members = (list as any[]).map((m) => ({
            user_id: m.user_id,
            nickname: m.card || m.nickname,
            role: m.role,
          }));
          return { members: members.slice(0, 50), total: members.length };
        } catch (err) {
          return { error: `Failed to get member list: ${err}` };
        }
      },
      returnToAI: true,
    });
  }

  // 查看图片工具（仅多模态模型可用，且当前没有已附加的图片时）
  const hasPendingImages =
    toolCtx.pendingImageUrls && toolCtx.pendingImageUrls.length > 0;
  // 如果消息中已经有图片附加，则不再提供 view_image 工具
  const hasAttachedImages = toolCtx.hasAttachedImages ?? false;
  if (toolCtx.config.isMultimodal && !hasPendingImages && !hasAttachedImages) {
    tools.push({
      name: "view_image",
      description:
        "View an image by its message ID. Use this when you need to see what's in an image to answer the user's question.",
      parameters: {
        type: "object",
        properties: {
          message_id: {
            type: "number",
            description:
              "The message ID (message_id) of the image. You can get this from the original message that contains the image.",
          },
        },
        required: ["message_id"],
      },
      handler: async (args) => {
        try {
          // 队列处理时 event 为 null，无法获取图片
          if (!toolCtx.event) {
            return { error: "No message context available" };
          }

          // 通过 message_id 获取消息详情
          const imageUrl = await toolCtx.ctx.getQuoteImageUrl(toolCtx.event);

          if (!imageUrl) {
            return { error: "Image not found" };
          }
          logger.info(imageUrl);
          if (!toolCtx.pendingImageUrls) {
            toolCtx.pendingImageUrls = [];
          }
          toolCtx.pendingImageUrls.push(imageUrl);

          return {
            success: true,
            note: "Now that the image has been successfully attached to the session, there is no need to call this tool to view the image, just continue the reasoning",
          };
        } catch (err) {
          return { error: `Failed to get image: ${err}` };
        }
      },
      returnToAI: true,
    });

    tools.push({
      name: "view_member_avatar",
      description:
        "View a group member's QQ avatar. Use this when you need to see what someone's avatar looks like.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description:
              "QQ number of the member whose avatar you want to view",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        try {
          const avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${args.user_id}&s=640`;

          if (!toolCtx.pendingImageUrls) {
            toolCtx.pendingImageUrls = [];
          }
          toolCtx.pendingImageUrls.push(avatarUrl);

          return {
            success: true,
            note: "The avatar has been successfully attached to the session. You can now see and describe the avatar and there is no need to call this tool to view the image.",
          };
        } catch (err) {
          return { error: `Failed to get avatar: ${err}` };
        }
      },
      returnToAI: true,
    });
  }

  return tools;
}

// ==================== Admin Tools ====================

function createAdminTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "mute_member",
      description: "Mute a group member for a specified duration",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "QQ number" },
          duration: {
            type: "number",
            description: "Mute duration in seconds (0 to unmute)",
          },
        },
        required: ["user_id", "duration"],
      },
      handler: async (args) => {
        try {
          await toolCtx.ctx.bot.setGroupBan(
            toolCtx.groupId!,
            args.user_id,
            args.duration,
          );
          const action = args.duration > 0 ? "muted" : "unmuted";
          return {
            success: true,
            action,
            user_id: args.user_id,
            duration: args.duration,
            message:
              args.duration > 0
                ? `已禁言用户 ${args.user_id} ${args.duration} 秒`
                : `已解除用户 ${args.user_id} 的禁言`,
          };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "kick_member",
      description: "Kick a member from the group",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "QQ number" },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        try {
          // 队列处理时 event 为 null，使用 groupId 替代
          const groupId = toolCtx.event?.group_id ?? toolCtx.groupId;
          await toolCtx.ctx.bot.api("set_group_kick", {
            group_id: groupId,
            user_id: args.user_id,
          });
          return {
            success: true,
            action: "kicked",
            user_id: args.user_id,
            message: `已将用户 ${args.user_id} 移出群聊`,
          };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "set_member_card",
      description: "Set a member's group nickname",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "QQ number" },
          card: { type: "string", description: "New nickname" },
        },
        required: ["user_id", "card"],
      },
      handler: async (args) => {
        try {
          await toolCtx.ctx.bot.setGroupCard(
            toolCtx.groupId!,
            args.user_id,
            args.card,
          );
          return {
            success: true,
            action: "card_set",
            user_id: args.user_id,
            card: args.card,
            message: `已将用户 ${args.user_id} 的群名片设置为 "${args.card}"`,
          };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "set_member_title",
      description: "Set a member's special title (owner only)",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "QQ number" },
          title: { type: "string", description: "Special title" },
        },
        required: ["user_id", "title"],
      },
      handler: async (args) => {
        try {
          await (toolCtx.ctx.bot as any).setGroupSpecialTitle(
            toolCtx.groupId!,
            args.user_id,
            args.title,
          );
          return {
            success: true,
            action: "title_set",
            user_id: args.user_id,
            title: args.title,
            message: `已将用户 ${args.user_id} 的专属头衔设置为 "${args.title}"`,
          };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "toggle_mute_all",
      description: "Toggle whole-group mute on/off",
      parameters: {
        type: "object",
        properties: {
          enable: {
            type: "boolean",
            description: "true to mute all, false to unmute",
          },
        },
        required: ["enable"],
      },
      handler: async (args) => {
        try {
          await toolCtx.ctx.bot.api("set_group_whole_ban", {
            group_id: toolCtx.groupId,
            enable: args.enable,
          });
          return {
            success: true,
            action: args.enable ? "group_muted" : "group_unmuted",
            message: args.enable ? "全体禁言已开启" : "全体禁言已关闭",
          };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: true,
    },
  ];
}

// ==================== Meta Tools ====================

function createLoadSkillTool(
  toolCtx: ToolContext,
  skillManager: SkillSessionManager,
): AITool {
  return {
    name: "load_skill",
    description:
      "Load an external skill's tools into the current session. Tools will be available for 1 hour.",
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "Skill name to load",
        },
      },
      required: ["skill_name"],
    },
    handler: async (args) => {
      const skill = toolCtx.aiService.getSkill(args.skill_name);
      if (!skill) {
        return { error: `Skill "${args.skill_name}" does not exist` };
      }

      const session = skillManager.loadSkill(
        toolCtx.sessionId,
        skill.name,
        skill.tools,
      );

      const loadedTools = skill.tools.map((t) => ({
        name: `${skill.name}.${t.name}`,
        description: t.description,
        parameters: t.parameters,
      }));

      return {
        success: true,
        skill_name: skill.name,
        expires_in: "1 hour",
        tools: loadedTools,
      };
    },
    returnToAI: true,
  };
}

function createUnloadSkillTool(
  toolCtx: ToolContext,
  skillManager: SkillSessionManager,
): AITool {
  return {
    name: "unload_skill",
    description:
      "Unload a previously loaded external skill from the current session.",
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "Skill name to unload",
        },
      },
      required: ["skill_name"],
    },
    handler: async (args) => {
      const removed = skillManager.unloadSkill(
        toolCtx.sessionId,
        args.skill_name,
      );
      if (!removed) {
        return { error: `Skill "${args.skill_name}" is not loaded` };
      }
      return { success: true, skill_name: args.skill_name };
    },
    returnToAI: false,
  };
}
