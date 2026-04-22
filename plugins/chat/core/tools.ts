import { logger } from "mioki";
import type { AITool } from "../../../src";
import type { SkillSession, ToolContext } from "../types";
import { searchWebWithSearxng } from "./searxng";
import { readWebPage } from "./web-reader";
import {
  filterAllowedExternalSkills,
  getSkillRequiredPermissionRole,
  isExternalSkillAllowed,
  hasSkillPermission,
} from "./external-skills";

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
  getActiveSkillsInfo(
    sessionId: string,
    isSkillVisible?: (skillName: string) => boolean,
  ): string;
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
    const allSkills = toolCtx.aiService.getAllSkills?.();
    const allowedSkills = allSkills
      ? filterAllowedExternalSkills(
          toolCtx.config,
          [...allSkills.values()],
          toolCtx.triggerSkillRole,
        )
      : [];

    if (allowedSkills.length > 0) {
      tools.push(createLoadSkillTool(toolCtx, skillManager));
    }
  }

  return { tools };
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
          const info = await toolCtx.ctx
            .pickBot(toolCtx.event.self_id)
            .getGroupMemberInfo(toolCtx.groupId!, args.user_id);
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
          const list = await toolCtx.ctx
            .pickBot(toolCtx.event.self_id)
            .getGroupMemberList(toolCtx.groupId!);
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
    });
  }

  if (toolCtx.config.searxng?.enabled) {
    tools.push({
      name: "web_search",
      description:
        "Search the web using SearXNG. Use this for current events, external facts, documentation, or anything not in chat history.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          queries: {
            type: "array",
            items: { type: "string" },
            description:
              "Alternative input. Multiple search queries; only the first non-empty query will be used.",
          },
          limit: {
            type: "number",
            description:
              "Max number of results to return. Will be clamped by config maxLimit.",
          },
          time_range: {
            type: "string",
            enum: ["day", "month", "year"],
            description: "Optional time filter for recent results",
          },
          categories: {
            type: "array",
            items: { type: "string" },
            description:
              'Optional categories, e.g. ["general"], ["news"], ["science"]',
          },
          engines: {
            type: "array",
            items: { type: "string" },
            description:
              'Optional engines, e.g. ["google"], ["bing"], ["duckduckgo"]',
          },
        },
        required: [],
      },
      handler: async (args) => {
        return searchWebWithSearxng(toolCtx.config.searxng, args || {});
      },
    });
  }

  if (toolCtx.config.webReader?.enabled) {
    tools.push({
      name: "web_read_page",
      description:
        "Read a webpage by URL, extract its main content, and compress the content into a short, information-dense passage. Use this directly when the user already provides a URL, or combine with web_search when you need to discover relevant pages first.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The http/https URL of the webpage to read",
          },
          render_js: {
            type: "boolean",
            description:
              "Set true only if the page likely requires JavaScript rendering. This uses much more CPU and memory.",
          },
          question: {
            type: "string",
            description:
              "Optional question or focus. The tool will prioritize webpage details relevant to this question.",
          },
        },
        required: ["url"],
      },
      handler: async (args) => {
        try {
          const ai = toolCtx.config.webReader.useWorkingModel
            ? toolCtx.aiService.getDefault()
            : undefined;
          if (toolCtx.config.webReader.useWorkingModel && !ai) {
            return { success: false, error: "AI instance not available" };
          }

          return await readWebPage(
            ai,
            toolCtx.config.workingModel || toolCtx.config.model,
            toolCtx.config.webReader,
            args || {},
          );
        } catch (err) {
          return { success: false, error: `Failed to read webpage: ${err}` };
        }
      },
    });
  }

  // 查看图片工具
  if (toolCtx.config.isMultimodal) {
    tools.push({
      name: "view_image",
      description:
        "View and analyze an image by its message ID. Use this when you need to see what's in an image to answer the user's question. The image will be analyzed and described to you.",
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
          // 通过 message_id 获取消息中的图片
          const { describeImage, getImageUrlByMessageId } =
            await import("./multimodal");
          const imageUrl = await getImageUrlByMessageId(
            toolCtx.ctx,
            args.message_id,
            toolCtx.event,
          );

          if (!imageUrl) {
            return { error: "Image not found in the specified message" };
          }

          // 使用多模态工作模型描述图片
          const ai = toolCtx.aiService.getDefault();
          if (!ai) {
            return { error: "AI instance not available" };
          }

          const result = await describeImage(
            ai,
            imageUrl,
            toolCtx.config.multimodalWorkingModel,
            toolCtx.event?.raw_message || undefined,
          );

          if (!result.success) {
            return { error: result.error || "Failed to analyze image" };
          }

          return {
            success: true,
            description: result.description,
            note: "The image has been analyzed. Use the description above to answer the user's question.",
          };
        } catch (err) {
          return { error: `Failed to analyze image: ${err}` };
        }
      },
    });

    tools.push({
      name: "view_member_avatar",
      description:
        "View and analyze a group member's QQ avatar. Use this when you need to see what someone's avatar looks like. The avatar will be analyzed and described to you.",
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

          logger.info(`[view_member_avatar] Analyzing avatar: ${avatarUrl}`);

          // 使用多模态工作模型描述头像
          const { describeImage } = await import("./multimodal");
          const ai = toolCtx.aiService.getDefault();
          if (!ai) {
            return { error: "AI instance not available" };
          }

          const result = await describeImage(
            ai,
            avatarUrl,
            toolCtx.config.multimodalWorkingModel,
            `User ${args.user_id}'s QQ avatar`,
          );

          if (!result.success) {
            return { error: result.error || "Failed to analyze avatar" };
          }

          return {
            success: true,
            description: result.description,
            note: "The avatar has been analyzed. Use the description above to answer the user's question.",
          };
        } catch (err) {
          return { error: `Failed to analyze avatar: ${err}` };
        }
      },
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
          await toolCtx.ctx
            .pickBot(toolCtx.event.self_id)
            .setGroupBan(toolCtx.groupId!, args.user_id, args.duration);
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
          await toolCtx.ctx
            .pickBot(toolCtx.event.self_id)
            .api("set_group_kick", {
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
          await toolCtx.ctx
            .pickBot(toolCtx.event.self_id)
            .setGroupCard(toolCtx.groupId!, args.user_id, args.card);
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
          await (
            toolCtx.ctx.pickBot(toolCtx.event.self_id) as any
          ).setGroupSpecialTitle(toolCtx.groupId!, args.user_id, args.title);
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
          await toolCtx.ctx
            .pickBot(toolCtx.event.self_id)
            .api("set_group_whole_ban", {
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
      if (!isExternalSkillAllowed(toolCtx.config, args.skill_name)) {
        const allSkills = toolCtx.aiService.getAllSkills?.();
        const allowedSkills = allSkills
          ? filterAllowedExternalSkills(
              toolCtx.config,
              [...allSkills.values()],
              toolCtx.triggerSkillRole,
            )
          : [];
        const allowedNames = allowedSkills.map((skill) => skill.name);

        return {
          error:
            allowedNames.length > 0
              ? `Skill "${args.skill_name}" is not allowed. Allowed skills: ${allowedNames.join(", ")}`
              : "No external skills are allowed in current config",
        };
      }

      const skill = toolCtx.aiService.getSkill(args.skill_name);
      if (!skill) {
        return { error: `Skill "${args.skill_name}" does not exist` };
      }
      const requiredRole = getSkillRequiredPermissionRole(skill);
      if (!hasSkillPermission(toolCtx.triggerSkillRole, requiredRole)) {
        return {
          error: `Permission denied: loading skill "${skill.name}" requires role "${requiredRole}", current role is "${toolCtx.triggerSkillRole}"`,
        };
      }

      skillManager.loadSkill(toolCtx.sessionId, skill.name, skill.tools);

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
  };
}
