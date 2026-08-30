import { isEventOwner } from "../../../runtime/mioku-context";
import type { MiokuContext } from "../../../runtime/mioku-context";
import { replyText, sendTextOrForward } from "./notify";
import { getCommandPrefix } from "./prefix";
import { getMarketItems } from "../system/package-manager";

function renderMarketText(
  kind: "plugin" | "service",
  items: Awaited<ReturnType<typeof getMarketItems>>,
): string {
  const label = kind === "plugin" ? "插件" : "服务";
  const lines = items.map((item) => {
    const status = item.installed
      ? item.hasUpdate
        ? `可更新 ${item.installedVersion}→${item.latest}`
        : `已安装 ${item.installedVersion}`
      : `未安装${item.latest ? `（最新 ${item.latest}）` : ""}`;
    return `• ${item.name}  [${status}]\n  ${item.description}`;
  });
  return [`Mioku ${label}市场（共 ${items.length} 个）`, ...lines].join("\n");
}

export function registerMarketCommands(ctx: MiokuContext): () => void {
  const dispose = ctx.handle("message", async (event) => {
    const text = ctx.text(event)?.trim();
    if (!text || event?.user_id === event?.self_id) return;

    const prefix = getCommandPrefix();
    const kind: "plugin" | "service" | null =
      text === `${prefix}plugin-market` || text === `${prefix}插件市场`
        ? "plugin"
        : text === `${prefix}service-market` || text === `${prefix}服务市场`
          ? "service"
          : null;
    if (!kind) return;

    if (!isEventOwner(event)) {
      ctx.logger.warn("[core] market 指令仅主人可用");
      return;
    }

    let items;
    try {
      items = await getMarketItems(kind);
    } catch (error) {
      ctx.logger.error(`[core] 获取市场信息失败: ${error}`);
      await replyText(event, `获取市场失败：${String(error)}`);
      return;
    }

    await sendTextOrForward({
      ctx,
      event,
      text: renderMarketText(kind, items),
      source: `Mioku ${kind === "plugin" ? "插件" : "服务"}市场`,
      summary: `共 ${items.length} 个`,
    });
  });

  return dispose;
}
