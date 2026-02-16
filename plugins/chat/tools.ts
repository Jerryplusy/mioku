import { logger } from "mioki";
import type { AITool } from "../../src";
import type { ToolContext } from "./types";
import type { OneTimeListenerManager } from "./listener";

interface CreateToolsResult {
  tools: AITool[];
  dynamicTools: Map<string, AITool>;
}

/**
 * 创建所有工具
 */
export function createTools(
  toolCtx: ToolContext,
  listenerManager: OneTimeListenerManager,
): CreateToolsResult {
  const dynamicTools = new Map<string, AITool>();
  const tools: AITool[] = [];

  // === 交流工具（始终可用）===
  tools.push(...createCommunicationTools(toolCtx));

  // === 信息查询工具（始终可用）===
  tools.push(...createInfoTools(toolCtx));

  // === 防御工具（始终可用）===
  tools.push(...createDefenseTools(toolCtx));

  // === 监听器工具 ===
  tools.push(createListenerTool(toolCtx, listenerManager));

  // === 群管工具（条件）===
  if (
    toolCtx.groupId &&
    toolCtx.config.enableGroupAdmin &&
    (toolCtx.botRole === "admin" || toolCtx.botRole === "owner")
  ) {
    tools.push(...createAdminTools(toolCtx));
  }

  // === Meta 工具（条件）===
  if (toolCtx.config.enableExternalSkills) {
    tools.push(createLoadSkillTool(toolCtx, dynamicTools));
  }

  return { tools, dynamicTools };
}

// ==================== 交流工具 ====================

function createCommunicationTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "send_message",
      description: "发送消息到当前聊天，支持分段发送",
      parameters: {
        type: "object",
        properties: {
          messages: {
            type: "array",
            description: "消息列表，每条消息会单独发送",
            items: {
              type: "object",
              properties: {
                segments: {
                  type: "array",
                  description: "消息片段列表",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["text", "at", "quote"],
                        description: "片段类型",
                      },
                      content: {
                        type: "string",
                        description: "文本内容（type=text 时必填）",
                      },
                      user_id: {
                        type: "number",
                        description: "要 @ 的用户 QQ（type=at 时必填）",
                      },
                      message_id: {
                        type: "string",
                        description: "要引用的消息 ID（type=quote 时必填）",
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
                  sendable.push(ctx.segment.text(seg.content));
                  messageTexts.push(seg.content);
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
      description: "戳一戳某个用户",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "要戳的用户 QQ",
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

// ==================== 信息查询工具 ====================

function createInfoTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "get_chat_history",
      description: "获取更多群聊历史消息记录",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "获取的消息数量，默认 20",
          },
        },
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };

        try {
          const result = await ctx.bot.api<any>("get_group_msg_history", {
            group_id: groupId,
            count: args.count ?? 20,
          });

          if (!result?.messages) return { messages: [] };

          const formatted = result.messages.map((msg: any) => {
            const time = new Date(msg.time * 1000);
            const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
            const sender = msg.sender?.nickname || msg.sender?.card || "未知";
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
      description: "搜索指定用户在当前会话中的近期消息",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "用户 QQ",
          },
          limit: {
            type: "number",
            description: "最多返回条数，默认 10",
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
      description: "获取用户头像链接",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "用户 QQ",
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
      description: "获取用户在其他群聊中的消息记录（跨群查询）",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "用户 QQ",
          },
          limit: {
            type: "number",
            description: "最多返回条数，默认 10",
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
        "结束本轮对话。当你觉得这次交流可以告一段落时调用此工具。不调用此工具会话将继续等待你的下一步操作。",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "结束原因（可选，用于调试）",
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

// ==================== 群管工具 ====================

function createAdminTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "mute_member",
      description: "禁言群成员",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "要禁言的用户 QQ",
          },
          duration: {
            type: "string",
            enum: ["1min", "5min", "10min"],
            description: "禁言时长",
          },
        },
        required: ["user_id", "duration"],
      },
      handler: async (args) => {
        const { ctx, event, groupId } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };

        // 检查发起人权限
        const senderRole = event.sender?.role;
        const isOwner = ctx.isOwner?.(event) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          return { error: "权限不足，只有管理员或群主可以命令禁言" };
        }

        // 检查目标权限
        try {
          const targetInfo = await ctx.bot.getGroupMemberInfo(
            groupId,
            args.user_id,
          );
          if (targetInfo.role === "admin" || targetInfo.role === "owner") {
            return { error: "不能禁言管理员或群主" };
          }
        } catch {
          // 获取失败则继续
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
      description: "踢出群成员（需要其他管理员确认）",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "要踢出的用户 QQ",
          },
          reason: {
            type: "string",
            description: "踢出原因",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { ctx, event, groupId } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };

        // 检查发起人权限
        const senderRole = event.sender?.role;
        const isOwner = ctx.isOwner?.(event) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          return { error: "权限不足" };
        }

        // 检查目标权限
        try {
          const targetInfo = await ctx.bot.getGroupMemberInfo(
            groupId,
            args.user_id,
          );
          if (targetInfo.role === "admin" || targetInfo.role === "owner") {
            return { error: "不能踢出管理员或群主" };
          }
        } catch {
          // ignore
        }

        // 发送确认请求
        const reason = args.reason ? `（原因：${args.reason}）` : "";
        await ctx.bot.sendGroupMsg(groupId, [
          ctx.segment.text(
            `⚠ 踢出确认：是否踢出 ${args.user_id}${reason}\n其他管理员请在 120 秒内回复"确认踢出"来确认，或回复"取消"来拒绝。`,
          ),
        ]);

        // 等待确认
        return new Promise<any>((resolve) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve({ success: false, reason: "确认超时，已取消" });
          }, 120_000);

          const cleanup = ctx.handle("message", async (e: any) => {
            if (e.group_id !== groupId) return;
            const text = ctx.text(e);
            const responderRole = e.sender?.role;
            const responderIsOwner = ctx.isOwner?.(e) ?? false;

            // 只接受其他管理员/群主/主人的确认
            if (
              e.user_id === event.user_id || // 不能自己确认自己
              (responderRole !== "admin" &&
                responderRole !== "owner" &&
                !responderIsOwner)
            ) {
              return;
            }

            if (text === "确认踢出") {
              clearTimeout(timeout);
              cleanup();
              try {
                await ctx.bot.kickGroupMember(groupId, args.user_id);
                resolve({ success: true });
              } catch (err) {
                resolve({ error: String(err) });
              }
            } else if (text === "取消") {
              clearTimeout(timeout);
              cleanup();
              resolve({ success: false, reason: "管理员已拒绝" });
            }
          });
        });
      },
      returnToAI: true,
    },
    {
      name: "set_member_card",
      description: "设置群成员的群昵称",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "用户 QQ",
          },
          card: {
            type: "string",
            description: "新的群昵称",
          },
        },
        required: ["user_id", "card"],
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };
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
      description: "设置群成员的专属头衔（需要bot是群主）",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "用户 QQ",
          },
          title: {
            type: "string",
            description: "新的专属头衔",
          },
        },
        required: ["user_id", "title"],
      },
      handler: async (args) => {
        const { ctx, groupId, botRole } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };
        if (botRole !== "owner") return { error: "需要群主权限" };
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
      description: "开启或关闭全体禁言",
      parameters: {
        type: "object",
        properties: {
          enable: {
            type: "boolean",
            description: "true 开启全体禁言，false 关闭",
          },
        },
        required: ["enable"],
      },
      handler: async (args) => {
        const { ctx, event, groupId } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };

        const senderRole = event.sender?.role;
        const isOwner = ctx.isOwner?.(event) ?? false;
        if (senderRole !== "admin" && senderRole !== "owner" && !isOwner) {
          return { error: "权限不足" };
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

// ==================== 防御工具 ====================

function createDefenseTools(toolCtx: ToolContext): AITool[] {
  return [
    {
      name: "auto_mute",
      description: "自动禁言辱骂者 1 分钟（自我保护，无需确认）",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "要禁言的用户 QQ",
          },
        },
        required: ["user_id"],
      },
      handler: async (args) => {
        const { ctx, groupId, botRole } = toolCtx;
        if (!groupId) return { error: "仅群聊可用" };
        if (botRole !== "admin" && botRole !== "owner") {
          return { error: "没有管理权限，无法禁言" };
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
      description: "向主人举报辱骂行为",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "number",
            description: "辱骂者 QQ",
          },
          user_name: {
            type: "string",
            description: "辱骂者昵称",
          },
          content: {
            type: "string",
            description: "辱骂内容摘要",
          },
        },
        required: ["user_id", "user_name", "content"],
      },
      handler: async (args) => {
        const { ctx, groupId } = toolCtx;
        const groupInfo = groupId ? `群 ${groupId}` : "私聊";
        const reportMsg = `⚠ 辱骂举报\n来源：${groupInfo}\n用户：${args.user_name}(${args.user_id})\n内容：${args.content}`;
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

// ==================== 监听器工具 ====================

function createListenerTool(
  toolCtx: ToolContext,
  listenerManager: OneTimeListenerManager,
): AITool {
  return {
    name: "register_listener",
    description: "注册一次性事件监听器，等待特定条件触发后唤醒你",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["next_user_message", "message_count"],
          description:
            "监听类型：next_user_message 等待指定用户发言，message_count 等待收到指定数量消息",
        },
        user_id: {
          type: "number",
          description: "目标用户 QQ（type=next_user_message 时必填）",
        },
        count: {
          type: "number",
          description: "消息数量（type=message_count 时必填）",
        },
        reason: {
          type: "string",
          description: "注册监听的原因（会在触发时提供给你）",
        },
      },
      required: ["type", "reason"],
    },
    handler: async (args) => {
      return listenerManager.register(toolCtx.sessionId, args.type, {
        userId: args.user_id,
        count: args.count,
        reason: args.reason,
      });
    },
    returnToAI: true,
  };
}

// ==================== Meta 工具 ====================

function createLoadSkillTool(
  toolCtx: ToolContext,
  dynamicTools: Map<string, AITool>,
): AITool {
  return {
    name: "load_skill",
    description: "加载外部插件的技能工具",
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "技能名称",
        },
      },
      required: ["skill_name"],
    },
    handler: async (args) => {
      const skill = toolCtx.aiService.getSkill(args.skill_name);
      if (!skill) {
        return { error: `技能 ${args.skill_name} 不存在` };
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
