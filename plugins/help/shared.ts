import * as fs from "fs";
import type { CommandRole, PluginHelp } from "../../src";
import type { HelpService } from "../../src/services/help";
import type { ScreenshotService } from "../../src/services/screenshot";

const ROLE_CONFIG: Record<
  CommandRole,
  { label: string; color: string; bgColor: string }
> = {
  master: {
    label: "主人",
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
  },
  admin: { label: "管理", color: "text-red-400", bgColor: "bg-red-500/20" },
  owner: {
    label: "群主",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
  },
  member: { label: "成员", color: "text-blue-400", bgColor: "bg-blue-500/20" },
};

export async function getPackageVersion(
  packageJsonPath: string,
): Promise<string> {
  try {
    const content = await fs.promises.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export function checkNightMode(): boolean {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7;
}

export function buildHelpInfoText(helpMap: Map<string, PluginHelp>): string {
  const info: string[] = ["=== Mioku Bot 帮助信息 ===\n"];

  for (const [pluginName, help] of helpMap) {
    info.push(`【${help.title || pluginName}】${help.description || ""}`);
    if (help.commands?.length) {
      for (const cmd of help.commands) {
        const roleLabel = cmd.role
          ? ` [${ROLE_CONFIG[cmd.role]?.label || cmd.role}]`
          : "";
        info.push(`  ${cmd.cmd}${roleLabel} - ${cmd.desc}`);
      }
    }
    info.push("");
  }

  return info.join("\n");
}

export async function generateHelpImage(options: {
  helpService?: HelpService;
  screenshotService?: ScreenshotService;
  miokiVersion?: string;
  miokuVersion?: string;
}): Promise<string | null> {
  const { helpService, screenshotService, miokiVersion, miokuVersion } =
    options;
  if (!helpService || !screenshotService) {
    return null;
  }

  const allHelp = helpService.getAllHelp();
  const htmlContent = generateHelpHtml(
    allHelp,
    checkNightMode(),
    miokiVersion,
    miokuVersion,
  );
  const pluginCount = allHelp.size;
  const estimatedHeight = Math.max(1280, Math.ceil(pluginCount / 2) * 280);

  return screenshotService.screenshot(htmlContent, {
    width: 720,
    height: estimatedHeight,
    fullPage: true,
    type: "png",
  });
}

export async function replyWithImage(
  event: any,
  segment: { image: (file: string) => any } | undefined,
  imagePath: string,
): Promise<void> {
  if (!event?.reply) {
    throw new Error("当前上下文不支持发送图片回复");
  }

  try {
    if (segment?.image) {
      await event.reply(segment.image(imagePath));
    } else {
      await event.reply([{ type: "image", file: imagePath }]);
    }
  } catch {
    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = `base64://${imageBuffer.toString("base64")}`;

    if (segment?.image) {
      await event.reply(segment.image(base64Image));
    } else {
      await event.reply([{ type: "image", file: base64Image }]);
    }
  }
}

export function generateHelpHtml(
  helpMap: Map<string, PluginHelp>,
  isNightMode: boolean,
  miokiVersion: string = "unknown",
  miokuVersion: string = "unknown",
): string {
  const plugins: string[] = [];

  const logoPath = "../../plugins/help/source/miku.png";

  const styles = isNightMode
    ? {
        bgOverlay: "rgba(13, 23, 28, 0.65)",
        cardBg: "rgba(22, 40, 48, 0.75)",
        cardBorder: "rgba(35, 66, 78, 0.6)",
        commandBg: "rgba(28, 48, 56, 0.8)",
        commandBorder: "rgba(35, 66, 78, 0.5)",
        commandTitleColor: "#5dd4c4",
        commandDescColor: "#c8e5e1",
        pluginTitleColor: "#d9f0ed",
        pluginDescColor: "#a3ccc6",
        noCommandColor: "#6b8a85",
        headerGradient:
          "linear-gradient(135deg, rgba(45, 212, 191, 0.6) 0%, rgba(52, 171, 192, 0.6) 50%, rgba(45, 212, 191, 0.6) 100%)",
        headerBg: "rgba(15, 28, 34, 0.3)",
        headerBorder: "rgba(45, 212, 191, 0.4)",
        footerBg: "rgba(22, 40, 48, 0.7)",
        footerBorder: "rgba(35, 66, 78, 0.6)",
        footerDivider: "rgba(45, 212, 191, 0.3)",
        footerLabelColor: "#a3ccc6",
        footerTextColor: "#5dd4c4",
      }
    : {
        bgOverlay: "rgba(240, 252, 252, 0)",
        cardBg: "rgba(255, 255, 255, 0.85)",
        cardBorder: "rgba(178, 219, 226, 0.5)",
        commandBg: "rgba(225, 247, 248, 0.9)",
        commandBorder: "rgba(178, 219, 226, 0.4)",
        commandTitleColor: "#0d7d7d",
        commandDescColor: "#0f3d47",
        pluginTitleColor: "#0f3d47",
        pluginDescColor: "#2d5f68",
        noCommandColor: "#6b8a85",
        headerGradient:
          "linear-gradient(135deg, rgba(45, 212, 191, 0.6) 0%, rgba(52, 171, 192, 0.6) 50%, rgba(45, 212, 191, 0.6) 100%)",
        headerBg: "rgba(255, 255, 255, 0.2)",
        headerBorder: "rgba(45, 212, 191, 0.3)",
        footerBg: "rgba(255, 255, 255, 0.75)",
        footerBorder: "rgba(178, 219, 226, 0.5)",
        footerDivider: "rgba(45, 212, 191, 0.4)",
        footerLabelColor: "#2d5f68",
        footerTextColor: "#0d7d7d",
      };

  for (const [pluginName, help] of helpMap) {
    const commands = help.commands || [];
    const commandsHtml = commands
      .map((cmd) => {
        const role = cmd.role as CommandRole | undefined;
        const roleConfig = role && ROLE_CONFIG[role] ? ROLE_CONFIG[role] : null;
        return `
        <div style="background: ${styles.commandBg}; border: 1px solid ${styles.commandBorder};" class="rounded-lg px-3 py-2 mb-2">
          <div class="flex items-center justify-between mb-1">
            <div style="color: ${styles.commandTitleColor};" class="font-mono text-xs font-bold">${escapeHtml(cmd.cmd)}</div>
            ${roleConfig ? `<span class="text-[10px] px-1.5 py-0.5 rounded ${roleConfig.bgColor} ${roleConfig.color} font-medium">${roleConfig.label}</span>` : ""}
          </div>
          <div style="color: ${styles.commandDescColor};" class="text-xs leading-snug">${escapeHtml(cmd.desc)}</div>
        </div>
      `;
      })
      .join("");

    plugins.push(`
      <div style="background: ${styles.cardBg}; border: 1px solid ${styles.cardBorder};" class="rounded-2xl shadow-lg p-4">
        <div class="mb-3 pb-2" style="border-bottom: 1px solid ${styles.cardBorder};">
          <h3 style="color: ${styles.pluginTitleColor};" class="text-base font-bold">${escapeHtml(help.title || pluginName)}</h3>
          ${help.description ? `<p style="color: ${styles.pluginDescColor};" class="text-xs mt-1">${escapeHtml(help.description)}</p>` : ""}
        </div>
        ${commands.length > 0 ? `<div class="space-y-1">${commandsHtml}</div>` : `<p style="color: ${styles.noCommandColor};" class="text-xs text-center py-2">暂无命令</p>`}
      </div>
    `);
  }

  return `
    <div class="min-h-screen p-6 pb-16 relative" style="background-image: url('https://uapis.cn/api/v1/random/image?category=acg&type=mb'); background-size: cover; background-position: center; background-attachment: fixed;">
      <div class="absolute inset-0" style="background: ${styles.bgOverlay}; backdrop-filter: blur(2px);"></div>

      <div class="relative rounded-3xl shadow-xl p-8 mb-6 overflow-hidden" style="background: ${styles.headerBg}; border: 1px solid ${styles.headerBorder}; backdrop-filter: blur(12px);">
        <div class="absolute inset-0" style="background: ${styles.headerGradient};"></div>

        <div class="absolute top-0 right-0 w-64 h-64 rounded-full -mr-32 -mt-32" style="background: ${isNightMode ? "rgba(45, 212, 191, 0.08)" : "rgba(45, 212, 191, 0.15)"};"></div>
        <div class="absolute bottom-0 left-0 w-48 h-48 rounded-full -ml-24 -mb-24" style="background: ${isNightMode ? "rgba(52, 171, 192, 0.08)" : "rgba(52, 171, 192, 0.15)"};"></div>

        <div class="relative z-10 flex items-center gap-5">
          <div class="w-28 h-28 flex items-center justify-center flex-shrink-0">
            <img src="${logoPath}" alt="logo" class="w-full h-full object-contain drop-shadow-lg" />
          </div>

          <div class="flex-1">
            <h1 class="text-4xl font-black text-white mb-1 tracking-tight" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.4), 0 0 20px rgba(45, 212, 191, 0.3);">Mioku Bot</h1>
            <p class="text-white text-base font-medium" style="text-shadow: 1px 1px 4px rgba(0,0,0,0.3);">帮助文档 · Help Documentation</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6 relative z-10">
        ${plugins.join("")}
      </div>

      <div class="absolute bottom-0 left-0 right-0 py-4 px-6">
        <div class="rounded-2xl py-4 px-6 shadow-lg" style="background: ${styles.footerBg}; border: 1px solid ${styles.footerBorder}; backdrop-filter: blur(8px);">
          <div class="flex items-center justify-center gap-10 text-base">
            <div class="flex items-center gap-3">
              <span class="text-2xl drop-shadow-sm">⚡</span>
              <div class="text-left">
                <div class="text-xs font-medium drop-shadow-sm" style="color: ${styles.footerLabelColor};">Framework</div>
                <div class="font-mono font-bold drop-shadow-md" style="color: ${styles.footerTextColor};">Mioki ${miokiVersion}</div>
              </div>
            </div>
            <div class="w-px h-12" style="background: ${styles.footerDivider};"></div>
            <div class="flex items-center gap-3">
              <span class="text-2xl drop-shadow-sm">🚀</span>
              <div class="text-left">
                <div class="text-xs font-medium drop-shadow-sm" style="color: ${styles.footerLabelColor};">Platform</div>
                <div class="font-mono font-bold drop-shadow-md" style="color: ${styles.footerTextColor};">Mioku ${miokuVersion}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (match) => map[match]);
}
