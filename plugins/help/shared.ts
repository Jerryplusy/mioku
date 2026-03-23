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
  const { helpService, screenshotService, miokiVersion, miokuVersion } = options;
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
        bgOverlay: "rgba(0,0,0,0.3)",
        cardBg: "bg-gray-800/40",
        cardBorder: "border-gray-600/40",
        commandBg: "bg-gray-700/50",
        commandBorder: "border-gray-600/40",
        commandTitleColor: "text-teal-300",
        commandDescColor: "text-gray-300",
        pluginTitleColor: "text-gray-100",
        pluginDescColor: "text-gray-400",
        noCommandColor: "text-gray-500",
        headerGradient: "from-indigo-500/60 via-purple-500/60 to-pink-500/60",
        headerBg: "bg-gray-800/30",
        headerBorder: "border-gray-600/40",
        footerBg: "bg-gray-800/40",
        footerBorder: "border-gray-600/40",
        footerDivider: "bg-gray-500/40",
        footerLabelColor: "text-gray-300",
        footerTextColor: "text-white",
      }
    : {
        bgOverlay: "rgba(255,255,255,0.15)",
        cardBg: "bg-white/40",
        cardBorder: "border-white/50",
        commandBg: "bg-teal-50/80",
        commandBorder: "border-teal-100/50",
        commandTitleColor: "text-teal-600",
        commandDescColor: "text-gray-500",
        pluginTitleColor: "text-gray-700",
        pluginDescColor: "text-gray-500",
        noCommandColor: "text-gray-400",
        headerGradient: "from-teal-400/60 via-cyan-400/60 to-blue-400/60",
        headerBg: "bg-white/20",
        headerBorder: "border-white/30",
        footerBg: "bg-white/30",
        footerBorder: "border-white/40",
        footerDivider: "bg-white/40",
        footerLabelColor: "text-black-300",
        footerTextColor: "text-teal-400",
      };

  for (const [pluginName, help] of helpMap) {
    const commands = help.commands || [];
    const commandsHtml = commands
      .map((cmd) => {
        const role = cmd.role as CommandRole | undefined;
        const roleConfig = role && ROLE_CONFIG[role] ? ROLE_CONFIG[role] : null;
        return `
        <div class="${styles.commandBg} backdrop-blur-sm rounded-lg px-3 py-2 mb-2 border ${styles.commandBorder}">
          <div class="flex items-center justify-between mb-1">
            <div class="${styles.commandTitleColor} font-mono text-xs font-bold">${escapeHtml(cmd.cmd)}</div>
            ${roleConfig ? `<span class="text-[10px] px-1.5 py-0.5 rounded ${roleConfig.bgColor} ${roleConfig.color} font-medium">${roleConfig.label}</span>` : ""}
          </div>
          <div class="${styles.commandDescColor} text-xs leading-snug">${escapeHtml(cmd.desc)}</div>
        </div>
      `;
      })
      .join("");

    plugins.push(`
      <div class="${styles.cardBg} backdrop-blur-md rounded-2xl shadow-md p-4 border ${styles.cardBorder}">
        <div class="mb-3 pb-2 border-b ${isNightMode ? "border-gray-700" : "border-teal-50"}">
          <h3 class="text-base font-bold ${styles.pluginTitleColor}">${escapeHtml(help.title || pluginName)}</h3>
          ${help.description ? `<p class="text-xs ${styles.pluginDescColor} mt-1">${escapeHtml(help.description)}</p>` : ""}
        </div>
        ${commands.length > 0 ? `<div class="space-y-1">${commandsHtml}</div>` : `<p class="${styles.noCommandColor} text-xs text-center py-2">暂无命令</p>`}
      </div>
    `);
  }

  return `
    <div class="min-h-screen p-6 pb-16 relative" style="background-image: url('https://uapis.cn/api/v1/random/image?category=acg&type=mb'); background-size: cover; background-position: center; background-attachment: fixed;">
      <div class="absolute inset-0 backdrop-blur-sm" style="background: ${styles.bgOverlay};"></div>

      <div class="relative rounded-3xl shadow-xl p-8 mb-6 overflow-hidden backdrop-blur-md ${styles.headerBg} border ${styles.headerBorder}">
        <div class="absolute inset-0 bg-gradient-to-r ${styles.headerGradient}"></div>

        <div class="absolute top-0 right-0 w-64 h-64 ${isNightMode ? "bg-white/10" : "bg-white/20"} rounded-full -mr-32 -mt-32 backdrop-blur-sm"></div>
        <div class="absolute bottom-0 left-0 w-48 h-48 ${isNightMode ? "bg-white/10" : "bg-white/20"} rounded-full -ml-24 -mb-24 backdrop-blur-sm"></div>

        <div class="relative z-10 flex items-center gap-5">
          <div class="w-28 h-28 flex items-center justify-center flex-shrink-0">
            <img src="${logoPath}" alt="logo" class="w-full h-full object-contain drop-shadow-lg" />
          </div>

          <div class="flex-1">
            <h1 class="text-4xl font-black text-white mb-1 tracking-tight drop-shadow-md">Mioku Bot</h1>
            <p class="text-white/90 text-base font-medium drop-shadow-sm">帮助文档 · Help Documentation</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6">
        ${plugins.join("")}
      </div>

      <div class="absolute bottom-0 left-0 right-0 py-4 px-6">
        <div class="backdrop-blur-md ${styles.footerBg} rounded-2xl border ${styles.footerBorder} py-4 px-6 shadow-lg">
          <div class="flex items-center justify-center gap-10 text-base">
            <div class="flex items-center gap-3">
              <span class="text-2xl drop-shadow-sm">⚡</span>
              <div class="text-left">
                <div class="text-xs ${styles.footerLabelColor} font-medium drop-shadow-sm">Framework</div>
                <div class="font-mono font-bold ${styles.footerTextColor} drop-shadow-md">Mioki ${miokiVersion}</div>
              </div>
            </div>
            <div class="w-px h-12 ${styles.footerDivider}"></div>
            <div class="flex items-center gap-3">
              <span class="text-2xl drop-shadow-sm">🚀</span>
              <div class="text-left">
                <div class="text-xs ${styles.footerLabelColor} font-medium drop-shadow-sm">Platform</div>
                <div class="font-mono font-bold ${styles.footerTextColor} drop-shadow-md">Mioku ${miokuVersion}</div>
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
