import type { MiokiContext } from "mioki";
import type { AITool, AISkill } from "../../src";
import type {
  SendMessageArgs,
  ToolCallResult,
  GroupMemberContext,
} from "./types";

/** 创建交流Skills */
export function createCommunicationTools(
  ctx: MiokiContext,
  currentGroupId?: number,
): AITool[] {
  return [
    {
      name: "send_message",
      description:
        "发送消息到当前群聊。每个text段落会作为独立消息发送，at和quote会附加到下一个text消息中。",
      parameters: {
        type: "object",
        properties: {
          segments: {
            type: "array",
            description: "消息段数组，每个text段落独立发送",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "at", "quote"],
                  description: "段落类型",
                },
                text: {
                  type: "string",
                  description: "文本内容（type=text时必填）",
                },
                qq: {
                  type: "number",
                  description: "要@的QQ号（type=at时必填）",
                },
                messageId: {
                  type: "string",
                  description: "要引用的消息ID（type=quote时必填）",
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["segments"],
      },
      handler: async (args: SendMessageArgs): Promise<ToolCallResult> => {
        if (!currentGroupId) {
          return { success: false, message: "当前不在群聊中" };
        }
        try {
          let pendingParts: any[] = []; // 存储待发送的 at/quote
          let sentCount = 0;

          for (const seg of args.segments) {
            switch (seg.type) {
              case "text":
                if (seg.text) {
                  // 发送之前积累的 at/quote + 当前 text
                  const messageParts = [...pendingParts, ctx.segment.text(seg.text)];
                  await ctx.bot.sendGroupMsg(currentGroupId, messageParts);
                  pendingParts = [];
                  sentCount++;
                }
                break;
              case "at":
                if (seg.qq) pendingParts.push(ctx.segment.at(seg.qq));
                break;
              case "quote":
                if (seg.messageId) pendingParts.push(ctx.segment.reply(seg.messageId));
                break;
            }
          }

          // 如果还有剩余的 at/quote 没发送（没有跟随 text）
          if (pendingParts.length > 0) {
            await ctx.bot.sendGroupMsg(currentGroupId, pendingParts);
            sentCount++;
          }

          if (sentCount === 0) {
            return { success: false, message: "没有有效的消息内容" };
          }
          return { success: true, message: `已发送${sentCount}条消息` };
        } catch (error) {
          return { success: false, message: `发送失败: ${error}` };
        }
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
      handler: async (args: { reason?: string }): Promise<ToolCallResult> => {
        return {
          success: true,
          message: "对话已结束",
          data: { reason: args.reason },
        };
      },
      returnToAI: false,
    },
    {
      name: "poke_user",
      description: "戳一戳某个群成员",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "要戳的用户QQ号" },
        },
        required: ["userId"],
      },
      handler: async (args: { userId: number }): Promise<ToolCallResult> => {
        if (!currentGroupId) {
          return { success: false, message: "当前不在群聊中" };
        }
        try {
          await ctx.bot.api("group_poke", {
            group_id: currentGroupId,
            user_id: args.userId,
          });
          return { success: true, message: `已戳 ${args.userId}` };
        } catch (error) {
          return { success: false, message: `戳一戳失败: ${error}` };
        }
      },
      returnToAI: true,
    },
  ];
}

/** 创建获取信息Skills */
export function createInfoTools(
  ctx: MiokiContext,
  currentGroupId?: number,
  currentUserId?: number,
): AITool[] {
  return [
    {
      name: "get_chat_history",
      description: "获取更多群聊历史记录（当默认提供的不足时使用）",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "要获取的消息数量，默认20，最大50",
          },
          beforeMessageId: {
            type: "string",
            description: "获取此消息之前的历史",
          },
        },
      },
      handler: async (args: {
        count?: number;
        beforeMessageId?: string;
      }): Promise<ToolCallResult> => {
        if (!currentGroupId) {
          return { success: false, message: "当前不在群聊中" };
        }
        try {
          const count = Math.min(args.count ?? 20, 50);
          const history = await ctx.bot.api("get_group_msg_history", {
            group_id: currentGroupId,
            count,
            message_seq: args.beforeMessageId
              ? parseInt(args.beforeMessageId)
              : undefined,
          });
          const messages =
            (history as any).messages?.map((msg: any) => ({
              messageId: msg.message_id,
              senderId: msg.sender?.user_id,
              senderName: msg.sender?.card || msg.sender?.nickname,
              content: msg.raw_message,
              time: new Date(msg.time * 1000).toLocaleString("zh-CN"),
            })) ?? [];
          return { success: true, data: messages };
        } catch (error) {
          return { success: false, message: `获取历史失败: ${error}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "get_user_recent_messages",
      description: "查找指定用户在当前群的近期发言",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "用户QQ号" },
          count: { type: "number", description: "要获取的消息数量，默认10" },
        },
        required: ["userId"],
      },
      handler: async (args: {
        userId: number;
        count?: number;
      }): Promise<ToolCallResult> => {
        if (!currentGroupId) {
          return { success: false, message: "当前不在群聊中" };
        }
        try {
          const count = Math.min(args.count ?? 10, 30);
          const history = await ctx.bot.api("get_group_msg_history", {
            group_id: currentGroupId,
            count: 100,
          });
          const userMessages = ((history as any).messages ?? [])
            .filter((msg: any) => msg.sender?.user_id === args.userId)
            .slice(0, count)
            .map((msg: any) => ({
              content: msg.raw_message,
              time: new Date(msg.time * 1000).toLocaleString("zh-CN"),
            }));
          return { success: true, data: userMessages };
        } catch (error) {
          return { success: false, message: `获取用户消息失败: ${error}` };
        }
      },
      returnToAI: true,
    },
    {
      name: "get_user_avatar",
      description: "获取用户头像URL",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "用户QQ号" },
        },
        required: ["userId"],
      },
      handler: async (args: { userId: number }): Promise<ToolCallResult> => {
        const avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${args.userId}&s=640`;
        return { success: true, data: { url: avatarUrl } };
      },
      returnToAI: true,
    },
    {
      name: "get_group_member_info",
      description: "获取群成员详细信息",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "用户QQ号" },
        },
        required: ["userId"],
      },
      handler: async (args: { userId: number }): Promise<ToolCallResult> => {
        if (!currentGroupId) {
          return { success: false, message: "当前不在群聊中" };
        }
        try {
          const info = await ctx.bot.getGroupMemberInfo(
            currentGroupId,
            args.userId,
          );
          const memberInfo: GroupMemberContext = {
            userId: info.user_id,
            nickname: info.nickname,
            card: info.card || info.nickname,
            title: info.title || "",
            role: info.role as "owner" | "admin" | "member",
            joinTime: info.join_time,
            lastSpeakTime: info.last_sent_time,
          };
          return { success: true, data: memberInfo };
        } catch (error) {
          return { success: false, message: `获取成员信息失败: ${error}` };
        }
      },
      returnToAI: true,
    },
  ];
}

/** 创建动态获取Skill的工具 */
export function createSkillLoaderTool(
  getAvailableSkills: () => string[],
  loadSkill: (skillName: string) => AISkill | undefined,
): AITool {
  return {
    name: "load_skill",
    description:
      "加载指定名称的Skill以获取更多工具。可用的Skill名称会在系统提示中列出。",
    parameters: {
      type: "object",
      properties: {
        skillName: { type: "string", description: "要加载的Skill名称" },
      },
      required: ["skillName"],
    },
    handler: async (args: { skillName: string }): Promise<ToolCallResult> => {
      const skill = loadSkill(args.skillName);
      if (!skill) {
        const available = getAvailableSkills();
        return {
          success: false,
          message: `Skill "${args.skillName}" 不存在。可用的Skill: ${available.join(", ")}`,
        };
      }
      return {
        success: true,
        message: `已加载Skill: ${skill.name}`,
        data: {
          name: skill.name,
          description: skill.description,
          tools: skill.tools.map((t) => ({
            name: `${skill.name}.${t.name}`,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      };
    },
    returnToAI: true,
  };
}
