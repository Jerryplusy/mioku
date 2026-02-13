import type { MiokuPlugin } from "../../src";
import type { HelpService } from "../../src/services/help";
import type { ScreenshotService } from "../../src/services/screenshot";
import type { MiokiContext } from "mioki";
import * as fs from "fs";

const helpPlugin: MiokuPlugin = {
  name: "help",
  version: "1.0.0",
  description: "帮助插件，生成帮助图片",
  services: ["help", "screenshot"],

  async setup(ctx: MiokiContext) {
    const helpService = ctx.services?.help as HelpService | undefined;
    const screenshotService = ctx.services?.screenshot as
      | ScreenshotService
      | undefined;

    if (!helpService) {
      ctx.logger.warn("help-service 未加载，帮助插件无法运行");
      return;
    }

    if (!screenshotService) {
      ctx.logger.warn("screenshot 服务未加载，帮助插件功能受限");
      return;
    }

    // 监听帮助命令
    ctx.handle("message", async (e: any) => {
      const text = ctx.text(e);
      if (!text) return;

      if (text.includes("help") || text.includes("帮助")) {
        try {
          const allHelp = helpService.getAllHelp();

          // 判断当前时间模式
          const isNightMode = checkNightMode();

          // 生成帮助 HTML
          const htmlContent = generateHelpHtml(allHelp, isNightMode);

          // 动态计算高度 - 根据插件数量
          const pluginCount = allHelp.size;
          const estimatedHeight = Math.max(
            1280,
            Math.ceil(pluginCount / 2) * 280,
          );

          // 截图
          const imagePath = await screenshotService.screenshot(htmlContent, {
            width: 720,
            height: estimatedHeight,
            fullPage: true,
            type: "png",
          });
          try {
            await e.reply(ctx.segment.image(imagePath));
          } catch (error) {
            ctx.logger.warn("帮助图片发送失败，将尝试使用base64编码发送");
            const imageBuffer = await fs.promises.readFile(imagePath);
            const base64Image = `base64://${imageBuffer.toString("base64")}`;
            await e.reply([{ type: "image", file: base64Image }]);
          }
          // 发送图片
        } catch (error) {
          ctx.logger.error(`生成帮助图片失败: ${error}`);
          await e.reply(`生成帮助图片失败: ${error}`);
        }
      }
    });

    return () => {
      ctx.logger.info("帮助插件已卸载");
    };
  },
};

/**
 * 判断是否夜晚模式
 */
function checkNightMode(): boolean {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7;
}

/**
 * 生成帮助 HTML
 */
function generateHelpHtml(
  helpMap: Map<string, any>,
  isNightMode: boolean,
): string {
  const plugins: string[] = [];

  // logo 图片路径（相对于 temp/screenshots/ 目录的相对路径）
  const logoPath = "../../plugins/help/source/miku.png";

  // 根据模式定义样式
  const styles = isNightMode
    ? {
        // 黑夜模式
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
        // 白天模式
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
      .map(
        (cmd: any) => `
        <div class="${styles.commandBg} backdrop-blur-sm rounded-lg px-3 py-2 mb-2 border ${styles.commandBorder}">
          <div class="${styles.commandTitleColor} font-mono text-xs font-bold mb-1">${escapeHtml(cmd.cmd)}</div>
          <div class="${styles.commandDescColor} text-xs leading-snug">${escapeHtml(cmd.desc)}</div>
        </div>
      `,
      )
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
    <div class="min-h-screen p-6 pb-16 relative" style="background-image: url('https://kasuie.cc/api/img/bg?type=mobile&size=regular'); background-size: cover; background-position: center; background-attachment: fixed;">
      <!-- 背景模糊遮罩 -->
      <div class="absolute inset-0 backdrop-blur-sm" style="background: ${styles.bgOverlay};"></div>
      
      <!-- 顶部标题区 -->
      <div class="relative rounded-3xl shadow-xl p-8 mb-6 overflow-hidden backdrop-blur-md ${styles.headerBg} border ${styles.headerBorder}">
        <!-- 半透明渐变遮罩 -->
        <div class="absolute inset-0 bg-gradient-to-r ${styles.headerGradient}"></div>
        
        <!-- 装饰圆圈 -->
        <div class="absolute top-0 right-0 w-64 h-64 ${isNightMode ? "bg-white/10" : "bg-white/20"} rounded-full -mr-32 -mt-32 backdrop-blur-sm"></div>
        <div class="absolute bottom-0 left-0 w-48 h-48 ${isNightMode ? "bg-white/10" : "bg-white/20"} rounded-full -ml-24 -mb-24 backdrop-blur-sm"></div>

        <div class="relative z-10 flex items-center gap-5">
          <!-- logo -->
          <div class="w-28 h-28 flex items-center justify-center flex-shrink-0">
            <img src="${logoPath}" alt="logo" class="w-full h-full object-contain drop-shadow-lg" />
          </div>

          <div class="flex-1">
            <h1 class="text-4xl font-black text-white mb-1 tracking-tight drop-shadow-md">Mioku Bot</h1>
            <p class="text-white/90 text-base font-medium drop-shadow-sm">帮助文档 · Help Documentation</p>
          </div>
        </div>
      </div>

      <!-- 插件列表  -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        ${plugins.join("")}
      </div>

      <!-- 页尾信息 -->
      <div class="absolute bottom-0 left-0 right-0 py-4 px-6">
        <div class="backdrop-blur-md ${styles.footerBg} rounded-2xl border ${styles.footerBorder} py-4 px-6 shadow-lg">
          <div class="flex items-center justify-center gap-10 text-base">
            <div class="flex items-center gap-3">
              <span class="text-2xl drop-shadow-sm">⚡</span>
              <div class="text-left">
                <div class="text-xs ${styles.footerLabelColor} font-medium drop-shadow-sm">Framework</div>
                <div class="font-mono font-bold ${styles.footerTextColor} drop-shadow-md">Mioki v0.15.0</div>
              </div>
            </div>
            <div class="w-px h-12 ${styles.footerDivider}"></div>
            <div class="flex items-center gap-3">
              <span class="text-2xl drop-shadow-sm">🚀</span>
              <div class="text-left">
                <div class="text-xs ${styles.footerLabelColor} font-medium drop-shadow-sm">Platform</div>
                <div class="font-mono font-bold ${styles.footerTextColor} drop-shadow-md">Mioku v0.1.0</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export default helpPlugin;
