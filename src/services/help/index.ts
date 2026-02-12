import { logger, MiokiContext } from "mioki";
import type { MiokuService, PluginHelp } from "../../core/types";

export interface HelpService {
  registerHelp(pluginName: string, help: PluginHelp): void;
  getHelp(pluginName: string): PluginHelp | undefined;
  getAllHelp(): Map<string, PluginHelp>;
  generateHelpText(): string;
  unregisterHelp(pluginName: string): boolean;
}

class HelpManager implements HelpService {
  private helpRegistry: Map<string, PluginHelp> = new Map();

  registerHelp(pluginName: string, help: PluginHelp): void {
    this.helpRegistry.set(pluginName, help);
    logger.debug(`${pluginName} has registered a help information`);
  }

  getHelp(pluginName: string): PluginHelp | undefined {
    return this.helpRegistry.get(pluginName);
  }

  getAllHelp(): Map<string, PluginHelp> {
    return this.helpRegistry;
  }

  generateHelpText(): string {
    if (this.helpRegistry.size === 0) {
      return "暂无可用插件";
    }

    const lines: string[] = [];
    lines.push("┌─────────────────────────────────────┐");
    lines.push("│      Mioku 机器人帮助文档            │");
    lines.push("├─────────────────────────────────────┤");

    for (const [pluginName, help] of this.helpRegistry) {
      lines.push(`│ ${help.title || pluginName}`);
      if (help.description) {
        lines.push(`│   ${help.description}`);
      }
      if (help.commands && help.commands.length > 0) {
        for (const cmd of help.commands) {
          const cmdLine = `│   ${cmd.cmd} - ${cmd.desc}`;
          lines.push(cmdLine);
          if (cmd.usage) {
            lines.push(`│     用法: ${cmd.usage}`);
          }
        }
      }
      lines.push("├─────────────────────────────────────┤");
    }

    lines.push("└─────────────────────────────────────┘");
    return lines.join("\n");
  }

  unregisterHelp(pluginName: string): boolean {
    const deleted = this.helpRegistry.delete(pluginName);
    if (deleted) {
      logger.info(`移除帮助信息: ${pluginName}`);
    }
    return deleted;
  }

  dispose(): void {
    this.helpRegistry.clear();
  }
}

/**
 * 帮助服务
 */
const helpService: MiokuService = {
  name: "help",
  version: "1.0.0",
  description: "帮助系统服务",
  api: {} as HelpService,

  async init(ctx: MiokiContext) {
    const helpManager = new HelpManager();
    this.api = helpManager;

    // 监听 #帮助 消息
    ctx.handle("message", async (e: any) => {
      const text = ctx.text(e);
      if (!text) return;

      if (text === "#帮助" || text === "help" || text === "帮助") {
        const helpText = helpManager.generateHelpText();
        await e.reply(helpText);
      }
    });

    logger.info("help-service 已就绪");
  },

  async dispose() {
    if (this.api && typeof this.api.dispose === "function") {
      this.api.dispose();
    }
    logger.info("help-service 已卸载");
  },
};

export default helpService;
