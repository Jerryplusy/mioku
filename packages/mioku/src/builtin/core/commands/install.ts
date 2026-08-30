import { isEventOwner } from "../../../runtime/mioku-context";
import type { MiokuContext } from "../../../runtime/mioku-context";
import { replyText } from "./notify";
import { getCommandPrefix } from "./prefix";
import { installPackage, uninstallPackage } from "../system/package-manager";

function parseTargetArgs(
  text: string,
  head: string,
): { type: "plugin" | "service"; name: string } | null {
  if (!text.startsWith(head)) return null;
  const rest = text.slice(head.length).trim();
  const matched = rest.match(/^(plugin|service)\s+([\s\S]+)$/);
  if (!matched) return null;
  const name = matched[2].trim();
  if (!name) return null;
  return { type: matched[1] as "plugin" | "service", name };
}

function typeLabel(type: "plugin" | "service"): string {
  return type === "plugin" ? "插件" : "服务";
}

export function registerInstallCommands(ctx: MiokuContext): () => void {
  const dispose = ctx.handle("message", async (event) => {
    const text = ctx.text(event)?.trim();
    if (!text || event?.user_id === event?.self_id) return;
    const prefix = getCommandPrefix();
    const installHead = `${prefix}install`;
    const uninstallHead = `${prefix}uninstall`;
    if (!text.startsWith(installHead) && !text.startsWith(uninstallHead))
      return;

    if (!isEventOwner(event)) {
      ctx.logger.warn("[core] install/uninstall 指令仅主人可用");
      return;
    }

    if (text.startsWith(installHead)) {
      const parsed = parseTargetArgs(text, installHead);
      if (!parsed) {
        await replyText(
          event,
          `用法：${prefix}install plugin <名称> 或 ${prefix}install service <名称>`,
        );
        return;
      }
      await replyText(
        event,
        `正在从 npm 安装${typeLabel(parsed.type)} ${parsed.name}...`,
      );
      try {
        const result = await installPackage(parsed.type, parsed.name);
        if (!result.ok) {
          ctx.logger.error(`[core] 安装失败: ${result.error || result.output}`);
          await replyText(event, `安装失败：${result.error || result.output}`);
          return;
        }
        const lines = [
          `已安装 ${result.packageName}`,
          result.enabled ? "已在 plugins 中启用" : "",
          "重启后生效",
        ].filter(Boolean);
        await replyText(event, lines.join("\n"));
      } catch (error) {
        ctx.logger.error(`[core] 安装失败: ${error}`);
        await replyText(event, `安装失败：${String(error)}`);
      }
      return;
    }

    const parsed = parseTargetArgs(text, uninstallHead);
    if (!parsed) {
      await replyText(
        event,
        `用法：${prefix}uninstall plugin <名称> 或 ${prefix}uninstall service <名称>`,
      );
      return;
    }
    await replyText(
      event,
      `正在卸载${typeLabel(parsed.type)} ${parsed.name}...`,
    );
    try {
      const result = await uninstallPackage(parsed.type, parsed.name);
      if (!result.ok) {
        ctx.logger.error(`[core] 卸载失败: ${result.error || result.output}`);
        await replyText(event, `卸载失败：${result.error || result.output}`);
        return;
      }
      const lines = [
        `已卸载 ${result.packageName}`,
        result.removedFromConfig ? "已从 plugins 中移除" : "",
        "重启后生效",
      ].filter(Boolean);
      await replyText(event, lines.join("\n"));
    } catch (error) {
      ctx.logger.error(`[core] 卸载失败: ${error}`);
      await replyText(event, `卸载失败：${String(error)}`);
    }
  });

  return dispose;
}
