import { logger } from "mioki";
import type { AITool } from "../../src";
import type { SkillSession, ToolContext } from "./types";

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

  // === Defense tools (always available) ===
  tools.push(...createDefenseTools(toolCtx));

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
      name: "at_user",
      description:
        "@ mention a user in your reply. Your text response will be sent along with the @ mention.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "QQ number of the user to @",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        return { success: true, user_id: args.user_id };
      },
      returnToAI: false,
    },
    {
      name: "quote_reply",
      description:
        "Quote-reply a specific message. Your text response will be sent as a reply to that message.",
      parameters: {
        type: "object",
        properties: {
          message_id: {
            type: "number",
            description: "Message ID to quote-reply",
          },
        },
        required: ["message_id"],
      },
      handler: async (args) => {
        return { success: true, message_id: args.message_id };
      },
      returnToAI: false,
    },
  ];
}

// ==================== Info Tools ====================

function createInfoTools(toolCtx: ToolContext): AITool[] {
  const tools: AITool[] = [];

  if (toolCtx.groupId) {
    tools.push({
      name: "get_group_member_info",
      description: "Get detailed info about a group member",
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
            user_id: (info as any).user_id,
            nickname: (info as any).nickname,
            card: (info as any).card,
            role: (info as any).role,
            title: (info as any).title,
            join_time: (info as any).join_time,
            last_sent_time: (info as any).last_sent_time,
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

  return tools;
}

// ==================== Defense Tools ====================

function createDefenseTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "report_abuse",
      description: "Report abusive behavior to the bot owner",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "QQ number of the abuser",
          },
          reason: {
            type: "string",
            description: "Reason for reporting",
          },
        },
        required: ["user_id", "reason"],
      },
      handler: async (args) => {
        const owners = (toolCtx.ctx as any).config?.owners || [];
        if (owners.length === 0) {
          return { error: "No bot owner configured" };
        }

        const groupInfo = toolCtx.groupId ? ` in group ${toolCtx.groupId}` : "";
        const msg = `[Abuse Report] User ${args.user_id}${groupInfo}: ${args.reason}`;

        for (const ownerId of owners) {
          try {
            await toolCtx.ctx.bot.sendPrivateMsg(ownerId, msg);
          } catch {
            // ignore
          }
        }
        return { success: true };
      },
      returnToAI: true,
    },
    {
      name: "auto_mute",
      description:
        "Self-defense: mute an abusive user for 1 minute. Only use when being personally attacked.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "QQ number of the user to mute",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        if (!toolCtx.groupId) return { error: "Not in a group" };
        if (toolCtx.botRole !== "admin" && toolCtx.botRole !== "owner") {
          return { error: "Bot is not admin" };
        }
        try {
          await toolCtx.ctx.bot.setGroupBan(toolCtx.groupId, args.user_id, 60);
          return { success: true, duration: 60 };
        } catch (err) {
          return { error: `Failed to mute: ${err}` };
        }
      },
      returnToAI: true,
    },
  ];
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
          return { success: true };
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
          await (toolCtx.ctx.bot as any).setGroupKick(
            toolCtx.groupId!,
            args.user_id,
          );
          return { success: true };
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
          return { success: true };
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
          return { success: true };
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
          await (toolCtx.ctx.bot as any).setGroupWholeBan(
            toolCtx.groupId!,
            args.enable,
          );
          return { success: true };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "poke_user",
      description: "Poke a user in the group (fun interaction)",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "QQ number" },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        try {
          if (groupId) {
            await ctx.bot.api("group_poke", {
              group_id: groupId,
              user_id: args.user_id,
            });
          } else {
            await ctx.bot.api("friend_poke", {
              user_id: args.user_id,
            });
          }
          return { success: true };
        } catch (err) {
          return { error: `Failed: ${err}` };
        }
      },
      returnToAI: false,
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
