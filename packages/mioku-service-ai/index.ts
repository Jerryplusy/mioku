import { logger } from "mioki";
import type { MiokuService } from "mioku";
import { createAIService } from "./service";
import type { AIService } from "./types";
import { parseToolArguments, normalizeToolResult } from "./core/tool-loop";

const aiService: MiokuService = {
  name: "ai",
  version: "3.0.0",
  description:
    "为插件提供完整的ai服务支持，包括多提供商管理、协议适配、提示词与 skills 管理等",
  api: {} as AIService,

  async init() {
    this.api = createAIService();
    logger.info("ai-service 服务已就绪（多提供商）");
  },

  async dispose() {
    const api = this.api as AIService & { dispose?: () => void };
    api.dispose?.();
    logger.info("ai-service 已卸载");
  },
};

export default aiService;

export { parseToolArguments, normalizeToolResult };
export type * from "./types";
export { createProviderClient, defaultApiUrl } from "./providers";
export { ProvidersRegistry } from "./providers-registry";
export { AIInstanceImpl } from "./instance";
export { AIServiceImpl, createAIService } from "./service";
