/**
 * 全局类型定义
 * 这些类型在整个 mioku 项目中可用
 */

declare global {
    // 文字消息类型
    interface TextMessage {
        role: "system" | "user" | "assistant";
        content: string;
    }

    // 多模态消息类型
    interface MultimodalMessage {
        role: "system" | "user" | "assistant";
        content:
        | string
        | Array<{
            type: "text" | "image_url";
            text?: string;
            image_url?: {
                url: string;
                detail?: "auto" | "low" | "high";
            };
        }>;
    }

    // AI 实例接口
    interface AIInstance {
        // 文字生成
        generateText(options: {
            prompt?: string;
            messages: TextMessage[];
            model: string;
            temperature?: number;
        }): Promise<string>;

        // 多模态生成
        generateMultimodal(options: {
            prompt?: string;
            messages: MultimodalMessage[];
            model: string;
            temperature?: number;
        }): Promise<string>;

        // 带工具调用的生成（智能循环模式）
        generateWithTools(options: {
            prompt?: string;
            messages: TextMessage[] | MultimodalMessage[];
            model: string;
            tools?: (string | import("./core/types").AITool)[];
            temperature?: number;
            maxIterations?: number;
        }): Promise<{
            content: string;
            iterations: number;
            allToolCalls: Array<{
                name: string;
                arguments: any;
                result: any;
                returnedToAI: boolean;
            }>;
        }>;

        // 注册工具
        registerTool(tool: import("./core/types").AITool): boolean;

        // 获取可用工具列表
        getTools(): string[];

        // 移除工具
        removeTool(toolName: string): boolean;

        // 注册提示词
        registerPrompt(name: string, prompt: string): boolean;

        // 获取提示词
        getPrompt(name: string): string | undefined;

        // 获取所有提示词
        getAllPrompts(): Record<string, string>;

        // 移除提示词
        removePrompt(name: string): boolean;
    }

    // AI 服务接口
    interface AIService {
        // 创建新的 AI 实例
        create(options: {
            name: string;
            apiUrl: string;
            apiKey: string;
            modelType: "text" | "multimodal";
        }): Promise<AIInstance>;

        // 获取已有实例
        get(name: string): AIInstance | undefined;

        // 获取所有实例名称
        list(): string[];

        // 删除实例
        remove(name: string): boolean;

        // 注册全局工具（所有实例共享）
        registerTool(tool: import("./core/types").AITool): boolean;

        // 获取所有全局工具
        getTools(): string[];

        // 移除全局工具
        removeTool(toolName: string): boolean;
    }
}

export { };
