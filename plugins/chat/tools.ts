import { logger } from "mioki";
import type { AITool } from "../../src";
import type { ToolContext } from "./types";

interface CreateToolsResult {
  tools: AITool[];
  dynamicTools: Map<string, AITool>;
}

/**
 * Create all tools
 */
export function createTools(toolCtx: ToolContext): CreateToolsResult {
  const dynamicTools = new Map<string, AITool>();
  const tools: AITool[] = [];

  // === Communication tools (always available) ===
  tools.push(...createCommunicationTools(toolCtx));

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
    tools.push(createLoadSkillTool(toolCtx, dynamicTools));
  }

  return { tools, dynamicTools };
}

// ==================== Communication Tools ====================

function createCommunicationTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "send_message",
      description: "Send message to current chat, supports multi-message sending",
      parameters: {
        type: "object",
        properties: {
          messages: {
            type: "array",
            description: "List of messages, each will be sent separately",
            items: {
              type: "object",
              properties: {
                segments: {
                  type: "array",
                  description: "List of message segments",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["text", "at", "quote"],
                        description: "Segment type",
                      },
                      content: {
                        type: "string",
                        description: "Text content (required when type=text)",
                      },
                      user_id: {
                        type: "number",
                        description: "User QQ to @ (required when type=at)",
                      },
                      message_id: {
                        type: "string",
                        description: "Message ID to quote (required when type=quote)",
                      },
                    },
                    required: ["type"],
                  },
                },
              },
              required: ["segments"],
            },
          },
        },
        required: ["messages"],
      },
      handler: async (args) => {
        const { ctx, event, sessionId, db } = toolCtx;
        const messageTexts: string[] = [];

        for (let i = 0; i < args.messages.length; i++) {
          const msg = args.messages[i];
          const sendable: any[] = [];

          for (const seg of msg.segments) {
            switch (seg.type) {
              case "text":
                if (seg.content) {
                  // 应用错别字生成器
                  const text = toolCtx.typoApply
                    ? toolCtx.typoApply(seg.content)
                    : seg.content;
                  sendable.push(ctx.segment.text(text));
                  messageTexts.push(text);
                }
                break;
              case "at":
                if (seg.user_id) {
                  sendable.push(ctx.segment.at(seg.user_id));
                }
                break;
              case "quote":
                if (seg.message_id) {
                  sendable.push(ctx.segment.reply(String(seg.message_id)));
                }
                break;
            }
          }

          if (sendable.length > 0) {
            try {
              await event.reply(sendable);
            } catch (err) {
              logger.error(`发送消息失败: ${err}`);
            }
          }

          // 多条消息之间加延迟
          if (i < args.messages.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        // 保存 assistant 消息到会话
        const fullText = messageTexts.join("\n");
        if (fullText) {
          db.saveMessage({
            sessionId,
            role: "assistant",
            content: fullText,
            timestamp: Date.now(),
          });
        }

        return { sent: true };
      },
      returnToAI: true,
    },
    {
      name: "poke_user",
      description: "Poke a user",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ to poke",
          },
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
          return { success: false, error: String(err) };
        }
      },
      returnToAI: true,
    },
  ];
}

// ==================== Info Query Tools ====================

function createInfoTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "get_chat_history",
      description: "Get more group chat history messages",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "Number of messages to get, default 20",
          },
        },
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        if (!groupId) return { error: "Group chat only" };

        try {
          const result = await ctx.bot.api<any>("get_group_msg_history", {
            group_id: groupId,
            count: args.count ?? 20,
          });

          if (!result?.messages) return { messages: [] };

          const formatted = result.messages.map((msg: any) => {
            const time = new Date(msg.time * 1000);
            const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
            const sender = msg.sender?.nickname || msg.sender?.card || "unknown";
            const content = msg.raw_message || "";
            return `[${timeStr}] ${sender}(${msg.user_id}): ${content}`;
          });

          return { messages: formatted };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
    {
      name: "search_user_messages",
      description: "Search recent messages from a specific user in current session",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ",
          },
          limit: {
            type: "number",
            description: "Max messages to return, default 10",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { db, sessionId } = toolCtx;
        const messages = db.getMessagesByUser(
          args.user_id,
          sessionId,
          args.limit ?? 10,
        );
        return {
          messages: messages.map((m) => ({
            time: new Date(m.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            content: m.content,
            role: m.role,
          })),
        };
      },
      returnToAI: true,
    },
    {
      name: "get_user_avatar",
      description: "Get user avatar URL",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        return {
          avatar_url: `https://q1.qlogo.cn/g?b=qq&nk=${args.user_id}&s=640`,
        };
      },
      returnToAI: true,
    },
    {
      name: "get_cross_group_messages",
      description: "Get user's messages in other group chats (cross-group query)",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ",
          },
          limit: {
            type: "number",
            description: "Max messages to return, default 10",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { db } = toolCtx;
        const personalSessionId = `personal:${args.user_id}`;
        const messages = db.getMessages(personalSessionId, args.limit ?? 10);
        return {
          messages: messages.map((m) => ({
            time: new Date(m.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            content: m.content,
            groupName: m.groupName,
            groupId: m.groupId,
          })),
        };
      },
      returnToAI: true,
    },
    {
      name: "end_conversation",
      description:
        "End this conversation turn. Call this when you feel the exchange is complete. Without this call, the conversation will continue waiting for your next action.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Reason for ending (optional, for debugging)",
          },
        },
        required: [],
      },
      handler: async (args: { reason?: string }) => {
        return {
          success: true,
          message: "对话已结束",
          data: { reason: args.reason },
        };
      },
      returnToAI: false,
    },
  ];
}

// ==================== Admin Tools ====================

function createAdminTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "mute_member",
      description: "Mute a group member",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ to mute",
          },
          duration: {
            type: "string",
            enum: ["1min", "5min", "10min"],
            description: "Mute duration",
          },
        },
        required: ["user_id", "duration"],
      },
      handler: async (args) => {
        const { ctx, event, groupId } = toolCtx;
        if (!groupId) return { error: "Group chat only" };

        // Check invoker permissions
        const senderRole = event.sender?.role;
        const isOwner = ctx.isOwner?.(event) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          return { error: "Insufficient permissions - only admin or owner can command mute" };
        }

        // Check target permissions
        try {
          const targetInfo = await ctx.bot.getGroupMemberInfo(
            groupId,
            args.user_id,
          );
          if (targetInfo.role === "admin" || targetInfo.role === "owner") {
            return { error: "Cannot mute admin or owner" };
          }
        } catch {
          // continue if failed
        }

        const durationMap: Record<string, number> = {
          "1min": 60,
          "5min": 300,
          "10min": 600,
        };
        const seconds = durationMap[args.duration] ?? 60;

        try {
          await ctx.bot.setGroupBan(groupId, args.user_id, seconds);
          return { success: true, duration: args.duration };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
    {
      name: "kick_member",
      description: "Kick a group member (requires other admin confirmation)",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ to kick",
          },
          reason: {
            type: "string",
            description: "Kick reason",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { ctx, event, groupId } = toolCtx;
        if (!groupId) return { error: "Group chat only" };

        // Check invoker permissions
        const senderRole = event.sender?.role;
        const isOwner = ctx.isOwner?.(event) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          return { error: "Insufficient permissions" };
        }

        // Check target permissions
        try {
          const targetInfo = await ctx.bot.getGroupMemberInfo(
            groupId,
            args.user_id,
          );
          if (targetInfo.role === "admin" || targetInfo.role === "owner") {
            return { error: "Cannot kick admin or owner" };
          }
        } catch {
          // ignore
        }

        // Send confirmation request
        const reason = args.reason ? ` (reason: ${args.reason})` : "";
        await ctx.bot.sendGroupMsg(groupId, [
          ctx.segment.text(
            `⚠ Kick confirmation: Kick ${args.user_id}${reason}?\nOther admins please reply "confirm" within 120 seconds to confirm, or "cancel" to reject.`,
          ),
        ]);

        // Wait for confirmation
        return new Promise<any>((resolve) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve({ success: false, reason: "Confirmation timeout, cancelled" });
          }, 120_000);

          const cleanup = ctx.handle("message", async (e: any) => {
            if (e.group_id !== groupId) return;
            const text = ctx.text(e);
            const responderRole = e.sender?.role;
            const responderIsOwner = ctx.isOwner?.(e) ?? false;

            // Only accept other admin/owner/owner's confirmation
            if (
              e.user_id === event.user_id || // cannot confirm self
              (responderRole !== "admin" &&
                responderRole !== "owner" &&
                !responderIsOwner)
            ) {
              return;
            }

            if (text === "confirm" || text === "确认踢出") {
              clearTimeout(timeout);
              cleanup();
              try {
                await ctx.bot.kickGroupMember(groupId, args.user_id);
                resolve({ success: true });
              } catch (err) {
                resolve({ error: String(err) });
              }
            } else if (text === "cancel" || text === "取消") {
              clearTimeout(timeout);
              cleanup();
              resolve({ success: false, reason: "Rejected by admin" });
            }
          });
        });
      },
      returnToAI: true,
    },
    {
      name: "set_member_card",
      description: "Set member's group nickname",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ",
          },
          card: {
            type: "string",
            description: "New group nickname",
          },
        },
        required: ["user_id", "card"],
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        if (!groupId) return { error: "Group chat only" };
        try {
          await ctx.bot.setGroupCard(groupId, args.user_id, args.card);
          return { success: true };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
    {
      name: "set_member_title",
      description: "Set member's special title (requires bot to be owner)",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ",
          },
          title: {
            type: "string",
            description: "New special title",
          },
        },
        required: ["user_id", "title"],
      },
      handler: async (args) => {
        const { ctx, groupId, botRole } = toolCtx;
        if (!groupId) return { error: "Group chat only" };
        if (botRole !== "owner") return { error: "Owner permission required" };
        try {
          await ctx.bot.setGroupSpecialTitle(groupId, args.user_id, args.title);
          return { success: true };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
    {
      name: "toggle_mute_all",
      description: "Enable or disable group-wide mute",
      parameters: {
        type: "object",
        properties: {
          enable: {
            type: "boolean",
            description: "true to enable group mute, false to disable",
          },
        },
        required: ["enable"],
      },
      handler: async (args) => {
        const { ctx, event, groupId } = toolCtx;
        if (!groupId) return { error: "Group chat only" };

        const senderRole = event.sender?.role;
        const isOwner = ctx.isOwner?.(event) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          return { error: "Insufficient permissions" };
        }

        try {
          await ctx.bot.api("set_group_whole_ban", {
            group_id: groupId,
            enable: args.enable,
          });
          return { success: true, enabled: args.enable };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
  ];
}

// ==================== Defense Tools ====================

function createDefenseTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "auto_mute",
      description: "Auto-mute abuser for 1 minute (self-protection, no confirmation needed)",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "User QQ to mute",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { ctx, groupId, botRole } = toolCtx;
        if (!groupId) return { error: "Group chat only" };
        if (botRole !== "admin" && botRole !== "owner") {
          return { error: "No admin permission, cannot mute" };
        }
        try {
          await ctx.bot.setGroupBan(groupId, args.user_id, 60);
          return { success: true };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
    {
      name: "report_abuse",
      description: "Report abusive behavior to bot owner",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "Abuser's QQ",
          },
          user_name: {
            type: "string",
            description: "Abuser's nickname",
          },
          content: {
            type: "string",
            description: "Summary of abusive content",
          },
        },
        required: ["user_id", "user_name", "content"],
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        const groupInfo = groupId ? `group ${groupId}` : "private chat";
        const reportMsg = `⚠ Abuse Report\nSource: ${groupInfo}\nUser: ${args.user_name}(${args.user_id})\nContent: ${args.content}`;
        try {
          await ctx.noticeMainOwner(reportMsg);
          return { success: true };
        } catch (err) {
          return { error: String(err) };
        }
      },
      returnToAI: true,
    },
  ];
}

// ==================== Meta Tools ====================

function createLoadSkillTool(
  toolCtx: ToolContext,
  dynamicTools: Map<string, AITool>,
): AITool {
  return {
    name: "load_skill",
    description: "Load external plugin's skill tools",
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "Skill name",
        },
      },
      required: ["skill_name"],
    },
    handler: async (args) => {
      const skill = toolCtx.aiService.getSkill(args.skill_name);
      if (!skill) {
        return { error: `Skill ${args.skill_name} does not exist` };
      }

      const loadedTools: {
        name: string;
        description: string;
        parameters: any;
      }[] = [];
      for (const tool of skill.tools) {
        const fullName = `${skill.name}.${tool.name}`;
        dynamicTools.set(fullName, tool);
        loadedTools.push({
          name: fullName,
          description: tool.description,
          parameters: tool.parameters,
        });
      }

      return {
        success: true,
        skill_name: skill.name,
        tools: loadedTools,
      };
    },
    returnToAI: true,
  };
}
