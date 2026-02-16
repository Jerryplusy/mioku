import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { logger } from "mioki";
import type { AITool } from "../../src";
import type { ChatConfig, ToolContext, ChatMessage } from "./types";
import type { SessionManager } from "./session";
import type { OneTimeListenerManager } from "./listener";
import { createTools } from "./tools";

export interface ChatResult {
  assistantContent: string;
  toolCalls: { name: string; args: any; result: any }[];
}

/**
 * 估算 token 数量（中文内容保守估算）
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 压缩上下文
 */
async function compressContext(
  client: OpenAI,
  config: ChatConfig,
  messages: ChatCompletionMessageParam[],
): Promise<string> {
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content:
          "请将以下聊天记录压缩为简洁的摘要。保留关键信息：谁说了什么、讨论了什么话题、有什么重要事件。用中文输出，不超过 500 字。",
      },
      {
        role: "user",
        content: messages
          .map((m) => {
            const content =
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content);
            return `[${m.role}] ${content}`;
          })
          .join("\n"),
      },
    ],
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || "（摘要生成失败）";
}

/**
 * 将历史消息格式化为 OpenAI 消息
 */
function formatHistoryMessages(
  history: ChatMessage[],
  isMultimodal: boolean,
): ChatCompletionMessageParam[] {
  return history.map((msg) => {
    if (msg.role === "assistant") {
      return { role: "assistant" as const, content: msg.content };
    }

    // 用户消息带元数据前缀
    const time = new Date(msg.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

    let prefix = `[${timeStr}]`;
    if (msg.userName) {
      prefix += ` ${msg.userName}`;
      if (msg.userId) {
        const roleLabel =
          msg.userRole === "owner"
            ? "群主"
            : msg.userRole === "admin"
              ? "管理员"
              : "群员";
        const titleStr = msg.userTitle ? `, ${msg.userTitle}` : "";
        prefix += `(${msg.userId}, ${roleLabel}${titleStr})`;
      }
      prefix += ":";
    }

    const content = `${prefix} ${msg.content}`;

    // 多模态消息：尝试解析 JSON 内容
    if (isMultimodal) {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          // 多模态内容数组
          const items = parsed.map((item: any) => {
            if (item.type === "image_url") {
              return item;
            }
            return {
              type: "text" as const,
              text: `${prefix} ${item.text || item}`,
            };
          });
          return { role: "user" as const, content: items };
        }
      } catch {
        // 非 JSON，使用纯文本
      }
    }

    return { role: "user" as const, content };
  });
}

/**
 * 运行 AI 聊天
 */
export async function runChat(
  toolCtx: ToolContext,
  history: ChatMessage[],
  systemPrompt: string,
  sessionManager: SessionManager,
  listenerManager: OneTimeListenerManager,
): Promise<ChatResult> {
  const { config, sessionId, userId, groupId } = toolCtx;
  const debugId = `${groupId ? `群${groupId}` : `用户${userId}`}`;

  logger.info(`[AI聊天] ${debugId} 开始处理会话 ${sessionId}`);

  const client = new OpenAI({
    baseURL: config.apiUrl,
    apiKey: config.apiKey,
  });

  // 创建工具
  const { tools: chatTools, dynamicTools } = createTools(
    toolCtx,
    listenerManager,
  );

  // 构建工具列表
  let openaiTools = buildOpenAITools(chatTools, dynamicTools);
  let toolHandlerMap = buildToolHandlerMap(chatTools, dynamicTools);

  if (openaiTools.length > 0) {
    logger.info(
      `[AI聊天] ${debugId} 可用工具: ${openaiTools.map((t) => t.function.name).join(", ")}`,
    );
  }

  // 构建消息
  const historyMessages = formatHistoryMessages(history, config.isMultimodal);
  const currentMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  logger.info(`[AI聊天] ${debugId} System Prompt:\n${systemPrompt}`);

  // 如果有压缩上下文，作为系统消息附加
  const session = sessionManager.get(toolCtx.sessionId);
  if (session?.compressedContext) {
    currentMessages.push({
      role: "system",
      content: `以下是之前聊天记录的摘要：\n${session.compressedContext}`,
    });
    logger.info(`[AI聊天] ${debugId} 压缩摘要:\n${session.compressedContext}`);
  }

  currentMessages.push(...historyMessages);

  if (historyMessages.length > 0) {
    logger.info(
      `[AI聊天] ${debugId} 历史消息 (${historyMessages.length} 条):\n${historyMessages
        .map((m) => {
          const content =
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content);
          return `[${m.role}] ${content.substring(0, 200)}${content.length > 200 ? "..." : ""}`;
        })
        .join("\n")}`,
    );
  }

  // 检查是否需要压缩上下文
  const totalText = currentMessages
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    )
    .join("");
  const estimatedTokenCount = estimateTokens(totalText);
  const maxTokens = config.maxContextTokens * 1024;

  if (estimatedTokenCount > maxTokens * 0.8 && historyMessages.length > 20) {
    // 压缩旧消息，保留最近 20 条
    const toCompress = historyMessages.slice(0, -20);
    const toKeep = historyMessages.slice(-20);

    try {
      const summary = await compressContext(client, config, toCompress);
      sessionManager.updateCompressedContext(toolCtx.sessionId, summary);

      // 重建消息列表
      currentMessages.length = 0;
      currentMessages.push(
        { role: "system", content: systemPrompt },
        { role: "system", content: `以下是之前聊天记录的摘要：\n${summary}` },
        ...toKeep,
      );
    } catch (err) {
      logger.error(`上下文压缩失败: ${err}`);
    }
  }

  // 工具调用循环
  const maxIterations = 20;
  let iterations = 0;
  const allToolCalls: { name: string; args: any; result: any }[] = [];
  let lastAssistantContent = "";

  while (iterations < maxIterations) {
    iterations++;

    logger.info(
      `[AI聊天] ${debugId} 第 ${iterations} 轮请求，消息数: ${currentMessages.length}`,
    );

    let response;
    try {
      response = await client.chat.completions.create({
        model: config.model,
        messages: currentMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        temperature: config.temperature,
      });
    } catch (err) {
      logger.error(`AI 调用失败: ${err}`);
      break;
    }

    const message = response.choices[0]?.message;
    if (!message) break;

    // 打印 reasoning (如果模型返回了)
    const reasoningContent =
      (message as any).reasoning_content || (message as any).reasoning;
    if (reasoningContent) {
      logger.info(`[AI聊天] ${debugId} 推理过程:\n${reasoningContent}`);
    }

    if (message.content) {
      lastAssistantContent = message.content;
      logger.info(`[AI聊天] ${debugId} 模型回复:\n${message.content}`);
    } else if (!message.tool_calls) {
      logger.info(`[AI聊天] ${debugId} 模型无回复内容`);
    }

    currentMessages.push(message as ChatCompletionMessageParam);

    // 没有工具调用则结束
    if (!message.tool_calls || message.tool_calls.length === 0) {
      break;
    }

    let hasReturnToAI = false;

    // 工具调用日志
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;

      const toolName = toolCall.function.name;
      const toolArgs = toolCall.function.arguments;

      logger.info(`[AI聊天] ${debugId} 工具调用: ${toolName}`);
      logger.info(`[AI聊天] ${debugId} 工具参数: ${toolArgs}`);

      const handler = toolHandlerMap.get(toolName);

      if (!handler) {
        logger.warn(`工具 ${toolName} 未找到`);
        // 仍然需要返回结果给 OpenAI
        currentMessages.push({
          role: "tool",
          content: JSON.stringify({ error: `工具 ${toolName} 不存在` }),
          tool_call_id: toolCall.id,
        } as ChatCompletionMessageParam);
        continue;
      }

      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await handler.tool.handler(args);

        allToolCalls.push({ name: toolName, args, result });
        logger.info(
          `[AI聊天] ${debugId} 工具结果: ${JSON.stringify(result).substring(0, 500)}${JSON.stringify(result).length > 500 ? "..." : ""}`,
        );

        // 始终推送工具结果到消息列表（OpenAI 要求）
        currentMessages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        } as ChatCompletionMessageParam);

        if (handler.tool.returnToAI) {
          hasReturnToAI = true;
        }

        // 如果加载了新技能，重建工具列表
        if (toolName === "load_skill" && result.success) {
          openaiTools = buildOpenAITools(chatTools, dynamicTools);
          toolHandlerMap = buildToolHandlerMap(chatTools, dynamicTools);
        }
      } catch (err) {
        logger.error(`工具 ${toolName} 执行失败: ${err}`);
        const errorResult = { error: String(err) };
        allToolCalls.push({
          name: toolName,
          args: toolCall.function.arguments,
          result: errorResult,
        });

        currentMessages.push({
          role: "tool",
          content: JSON.stringify(errorResult),
          tool_call_id: toolCall.id,
        } as ChatCompletionMessageParam);

        if (handler.tool.returnToAI) {
          hasReturnToAI = true;
        }
      }
    }

    // 如果没有 returnToAI 的工具，结束循环
    if (!hasReturnToAI) {
      break;
    }
  }

  if (iterations >= maxIterations) {
    logger.warn("AI 工具调用达到最大迭代次数");
  }

  logger.info(
    `[AI聊天] ${debugId} 完成，共 ${iterations} 轮，工具调用 ${allToolCalls.length} 次`,
  );

  return {
    assistantContent: lastAssistantContent,
    toolCalls: allToolCalls,
  };
}

/**
 * 构建 OpenAI 格式的工具列表
 */
function buildOpenAITools(
  chatTools: AITool[],
  dynamicTools: Map<string, AITool>,
): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [];

  for (const tool of chatTools) {
    tools.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }

  for (const [name, tool] of dynamicTools) {
    tools.push({
      type: "function",
      function: {
        name: name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }

  return tools;
}

/**
 * 构建工具名称到 handler 的映射
 */
function buildToolHandlerMap(
  chatTools: AITool[],
  dynamicTools: Map<string, AITool>,
): Map<string, { tool: AITool }> {
  const map = new Map<string, { tool: AITool }>();

  for (const tool of chatTools) {
    map.set(tool.name, { tool });
  }

  for (const [name, tool] of dynamicTools) {
    map.set(name, { tool });
  }

  return map;
}
