import type { AISkill, AITool } from "../../src";
import {
  buildHelpInfoText,
  generateHelpImage,
  replyWithImage,
} from "./shared";
import { getHelpRuntimeState } from "./runtime";

const helpSkills: AISkill[] = [
  {
    name: "help",
    description: "帮助系统，获取插件帮助信息和发送帮助图片",
    tools: [
      {
        name: "get_help_info",
        description:
          "获取所有插件的帮助信息文本，这个仅用于用户向你询问某个功能的具体用法时使用",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        handler: async () => {
          const { helpService } = getHelpRuntimeState();
          if (!helpService) {
            return "help-service 未加载，无法获取帮助信息";
          }

          return buildHelpInfoText(helpService.getAllHelp());
        },
      } as AITool,
      {
        name: "send_help_image",
        description:
          "生成并发送帮助图片到群聊，如果有人说他想看帮助，优先调用图片发送而不是自己查看帮助",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        handler: async (_args: any, event?: any) => {
          const {
            ctx,
            helpService,
            screenshotService,
            miokiVersion,
            miokuVersion,
          } = getHelpRuntimeState();

          if (!screenshotService) {
            return "screenshot 服务未加载，无法生成帮助图片";
          }

          try {
            const imagePath = await generateHelpImage({
              helpService,
              screenshotService,
              miokiVersion,
              miokuVersion,
            });

            if (!imagePath) {
              return "生成帮助图片失败";
            }

            if (event?.reply) {
              await replyWithImage(event, ctx?.segment, imagePath);
              return "已发送帮助图片";
            }

            return "帮助图片已生成，但当前上下文不支持发送";
          } catch (error) {
            return `生成帮助图片失败: ${error}`;
          }
        },
      } as AITool,
    ],
  },
];

export default helpSkills;
