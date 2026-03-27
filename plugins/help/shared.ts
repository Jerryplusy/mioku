import * as fs from "fs";
import type { CommandRole, PluginHelp } from "../../src";
import type { HelpService } from "../../src/services/help";
import type { ScreenshotService } from "../../src/services/screenshot";

const ROLE_CONFIG: Record<
  CommandRole,
  {
    label: string;
    badgeBgLight: string;
    badgeBorderLight: string;
    badgeTextLight: string;
    badgeBgDark: string;
    badgeBorderDark: string;
    badgeTextDark: string;
  }
> = {
  master: {
    label: "主人",
    badgeBgLight: "rgba(245, 158, 11, 0.14)",
    badgeBorderLight: "rgba(217, 119, 6, 0.24)",
    badgeTextLight: "#92400e",
    badgeBgDark: "rgba(245, 158, 11, 0.18)",
    badgeBorderDark: "rgba(251, 191, 36, 0.28)",
    badgeTextDark: "#fcd34d",
  },
  admin: {
    label: "管理",
    badgeBgLight: "rgba(239, 68, 68, 0.12)",
    badgeBorderLight: "rgba(220, 38, 38, 0.22)",
    badgeTextLight: "#b91c1c",
    badgeBgDark: "rgba(239, 68, 68, 0.16)",
    badgeBorderDark: "rgba(248, 113, 113, 0.22)",
    badgeTextDark: "#fca5a5",
  },
  owner: {
    label: "管理",
    badgeBgLight: "rgba(239, 68, 68, 0.12)",
    badgeBorderLight: "rgba(220, 38, 38, 0.22)",
    badgeTextLight: "#b91c1c",
    badgeBgDark: "rgba(239, 68, 68, 0.16)",
    badgeBorderDark: "rgba(248, 113, 113, 0.22)",
    badgeTextDark: "#fca5a5",
  },
  member: {
    label: "成员",
    badgeBgLight: "rgba(14, 165, 233, 0.12)",
    badgeBorderLight: "rgba(2, 132, 199, 0.2)",
    badgeTextLight: "#0369a1",
    badgeBgDark: "rgba(56, 189, 248, 0.16)",
    badgeBorderDark: "rgba(103, 232, 249, 0.22)",
    badgeTextDark: "#67e8f9",
  },
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

export async function getHelpRenderVersions(): Promise<{
  miokiVersion: string;
  miokuVersion: string;
}> {
  const miokiVersion = await getPackageVersion(
    `${process.cwd()}/node_modules/mioki/package.json`,
  );
  const miokuVersion = await getPackageVersion(
    `${process.cwd()}/package.json`,
  );

  return {
    miokiVersion,
    miokuVersion,
  };
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
  botNickname?: string;
  botAvatarUrl?: string;
}): Promise<string | null> {
  const {
    helpService,
    screenshotService,
    miokiVersion,
    miokuVersion,
    botNickname,
    botAvatarUrl,
  } = options;
  if (!helpService || !screenshotService) {
    return null;
  }

  const allHelp = helpService.getAllHelp();
  const pluginCount = allHelp.size;
  const isCompact = resolveCompactMode(pluginCount);
  const htmlContent = generateHelpHtml(
    allHelp,
    checkNightMode(),
    miokiVersion,
    miokuVersion,
    botNickname,
    botAvatarUrl,
  );
  const estimatedHeight = isCompact
    ? Math.max(1280, Math.ceil(pluginCount / 2) * 180)
    : Math.max(1280, Math.ceil(pluginCount / 2) * 280);

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

export async function sendImageFromSkillContext(options: {
  ctx: any;
  event: any;
  imagePath: string;
  quoteReply?: boolean;
}): Promise<void> {
  const { ctx, event, imagePath, quoteReply = false } = options;
  const selfId =
    event?.self_id != null ? Number(event.self_id) : undefined;
  const bot =
    selfId != null && typeof ctx?.pickBot === "function"
      ? ctx.pickBot(selfId)
      : undefined;

  if (!bot) {
    throw new Error("当前上下文不支持发送图片");
  }

  const buildImageSegment = (file: string) => {
    const normalizedFile = normalizeImageSource(file);
    if (ctx?.segment?.image) {
      return ctx.segment.image(normalizedFile);
    }
    return { type: "image", file: normalizedFile };
  };

  const sendPayload = async (file: string) => {
    const payload: any[] = [];
    if (quoteReply && event?.message_id != null) {
      payload.push({ type: "reply", id: String(event.message_id) });
    }
    payload.push(buildImageSegment(file));

    if (event?.message_type === "group" && event?.group_id != null) {
      await bot.sendGroupMsg(event.group_id, payload);
      return;
    }

    if (event?.user_id != null) {
      await bot.sendPrivateMsg(event.user_id, payload);
      return;
    }

    throw new Error("当前上下文不支持发送图片");
  };

  try {
    await sendPayload(imagePath);
  } catch (error) {
    if (!isLocalFilePath(imagePath)) {
      throw error;
    }

    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = `base64://${imageBuffer.toString("base64")}`;
    await sendPayload(base64Image);
  }
}

export function generateHelpHtml(
  helpMap: Map<string, PluginHelp>,
  isNightMode: boolean,
  miokiVersion: string = "unknown",
  miokuVersion: string = "unknown",
  botNickname: string = "Mioku Bot",
  botAvatarUrl?: string,
): string {
  const pluginCount = helpMap.size;
  const isCompact = resolveCompactMode(pluginCount);
  const logoPath = "../../plugins/help/source/miku.png";
  const avatarSrc = botAvatarUrl || logoPath;
  const backgroundImageUrl =
    "https://uapis.cn/api/v1/random/image?category=acg&type=mb";
  const theme = isNightMode
    ? {
        pageBg:
          "linear-gradient(180deg, #07141c 0%, #0b1c25 52%, #102730 100%)",
        shellBg: "rgba(6, 19, 25, 0.34)",
        pageAccent:
          "radial-gradient(circle at 18% 14%, rgba(76, 201, 191, 0.18), transparent 34%), radial-gradient(circle at 82% 10%, rgba(34, 211, 238, 0.12), transparent 28%), radial-gradient(circle at 50% 100%, rgba(45, 212, 191, 0.1), transparent 42%)",
        pageGrid:
          "linear-gradient(rgba(151, 214, 210, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(151, 214, 210, 0.04) 1px, transparent 1px)",
        sceneOpacity: "0.48",
        sceneFilter:
          "blur(1.5px) saturate(0.96) contrast(1.05) brightness(0.72)",
        sceneMask:
          "linear-gradient(180deg, rgba(3, 11, 15, 0.34), rgba(4, 16, 22, 0.2) 26%, rgba(4, 14, 20, 0.06) 52%, rgba(3, 10, 14, 0.4) 100%)",
        sceneGlow:
          "radial-gradient(circle at 24% 16%, rgba(126, 231, 221, 0.16), transparent 28%), radial-gradient(circle at 78% 10%, rgba(34, 211, 238, 0.14), transparent 26%)",
        shellBorder: "rgba(116, 202, 200, 0.18)",
        shellShadow: "0 32px 70px rgba(1, 11, 16, 0.45)",
        heroBg:
          "linear-gradient(135deg, rgba(16, 40, 50, 0.94), rgba(14, 32, 42, 0.88))",
        heroBorder: "rgba(105, 196, 194, 0.24)",
        heroGlow: "rgba(77, 217, 200, 0.16)",
        logoPlate:
          "linear-gradient(180deg, rgba(14, 31, 39, 0.98), rgba(19, 44, 54, 0.94))",
        logoBorder: "rgba(125, 218, 211, 0.2)",
        logoShadow: "0 18px 40px rgba(0, 0, 0, 0.28)",
        logoHalo: "rgba(126, 231, 221, 0.14)",
        eyebrow: "#7ee7dd",
        title: "#ecfeff",
        subtitle: "#b9d7d8",
        panelBg: "rgba(12, 29, 38, 0.86)",
        panelBorder: "rgba(105, 196, 194, 0.16)",
        panelShadow: "0 18px 42px rgba(0, 0, 0, 0.22)",
        panelTitle: "#f0fdff",
        panelDesc: "#98babc",
        commandBg: "rgba(18, 41, 50, 0.92)",
        commandBorder: "rgba(108, 185, 182, 0.14)",
        commandTitle: "#83f0e1",
        commandDesc: "#d8eeed",
        emptyText: "#78999a",
        footerBg: "rgba(10, 24, 32, 0.82)",
        footerBorder: "rgba(105, 196, 194, 0.16)",
        footerLabel: "#85aeb0",
        footerText: "#dffcf8",
        divider: "rgba(105, 196, 194, 0.18)",
      }
    : {
        pageBg:
          "linear-gradient(180deg, #eef6f7 0%, #f6fbfb 48%, #edf5f7 100%)",
        shellBg: "rgba(255, 255, 255, 0.42)",
        pageAccent:
          "radial-gradient(circle at 12% 10%, rgba(45, 212, 191, 0.18), transparent 28%), radial-gradient(circle at 88% 0%, rgba(56, 189, 248, 0.14), transparent 24%), radial-gradient(circle at 50% 100%, rgba(13, 148, 136, 0.08), transparent 44%)",
        pageGrid:
          "linear-gradient(rgba(17, 94, 89, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(17, 94, 89, 0.05) 1px, transparent 1px)",
        sceneOpacity: "0.42",
        sceneFilter:
          "blur(1.5px) saturate(0.98) contrast(1.02) brightness(1.03)",
        sceneMask:
          "linear-gradient(180deg, rgba(244, 250, 251, 0.4), rgba(244, 250, 251, 0.22) 30%, rgba(244, 250, 251, 0.04) 58%, rgba(237, 245, 247, 0.46) 100%)",
        sceneGlow:
          "radial-gradient(circle at 18% 14%, rgba(45, 212, 191, 0.14), transparent 28%), radial-gradient(circle at 82% 8%, rgba(56, 189, 248, 0.12), transparent 24%)",
        shellBorder: "rgba(148, 196, 204, 0.62)",
        shellShadow: "0 26px 60px rgba(12, 50, 59, 0.12)",
        heroBg:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(240, 250, 249, 0.94))",
        heroBorder: "rgba(148, 196, 204, 0.7)",
        heroGlow: "rgba(45, 212, 191, 0.14)",
        logoPlate:
          "linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(243, 251, 251, 0.98))",
        logoBorder: "rgba(148, 196, 204, 0.72)",
        logoShadow: "0 14px 32px rgba(15, 61, 71, 0.1)",
        logoHalo: "rgba(45, 212, 191, 0.1)",
        eyebrow: "#0f766e",
        title: "#0f172a",
        subtitle: "#335761",
        panelBg: "rgba(255, 255, 255, 0.95)",
        panelBorder: "rgba(148, 196, 204, 0.68)",
        panelShadow: "0 16px 36px rgba(15, 61, 71, 0.08)",
        panelTitle: "#102430",
        panelDesc: "#4b6770",
        commandBg: "rgba(244, 251, 251, 0.98)",
        commandBorder: "rgba(185, 217, 221, 0.82)",
        commandTitle: "#0f766e",
        commandDesc: "#17353f",
        emptyText: "#6f8b93",
        footerBg: "rgba(255, 255, 255, 0.94)",
        footerBorder: "rgba(148, 196, 204, 0.72)",
        footerLabel: "#5b7680",
        footerText: "#0f172a",
        divider: "rgba(148, 196, 204, 0.78)",
      };

  const plugins = Array.from(helpMap.entries())
    .map(([pluginName, help]) => {
      const commands = help.commands || [];
      const commandsHtml = commands
        .map((cmd) => {
          const role = cmd.role as CommandRole | undefined;
          const roleBadge = role ? renderRoleBadge(role, isNightMode) : "";

          return `
            <div class="help-command">
              <div class="help-command__top">
                <div class="help-command__main">
                  <span class="help-command__name">${escapeHtml(cmd.cmd)}</span>
                  <span class="help-command__inline-desc">${escapeHtml(cmd.desc)}</span>
                </div>
                ${roleBadge}
              </div>
              ${isCompact ? "" : `<div class="help-command__desc">${escapeHtml(cmd.desc)}</div>`}
            </div>
          `;
        })
        .join("");

      return `
        <section class="help-plugin ${isCompact ? "help-plugin--compact" : ""}">
          <div class="help-plugin__head">
            ${
              isCompact
                ? `<div class="help-plugin__title-row">
                    <h3 class="help-plugin__title">${escapeHtml(help.title || pluginName)}</h3>
                    ${help.description ? `<span class="help-plugin__desc help-plugin__desc--inline">${escapeHtml(help.description)}</span>` : ""}
                  </div>`
                : `<h3 class="help-plugin__title">${escapeHtml(help.title || pluginName)}</h3>
                  ${help.description ? `<p class="help-plugin__desc">${escapeHtml(help.description)}</p>` : ""}`
            }
          </div>
          ${
            commands.length > 0
              ? `<div class="help-plugin__body">${commandsHtml}</div>`
              : `<p class="help-plugin__empty">暂无命令</p>`
          }
        </section>
      `;
    })
    .join("");

  return `
    <style>
      .help-sheet {
        min-height: 100vh;
        padding: ${isCompact ? "18px" : "24px"};
        display: flex;
        flex-direction: column;
        gap: ${isCompact ? "14px" : "18px"};
        position: relative;
        overflow: hidden;
        background: ${theme.pageBg};
        color: ${theme.panelTitle};
        font-family: "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }

      .help-sheet::before,
      .help-sheet::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .help-sheet::before {
        background: ${theme.pageAccent};
      }

      .help-sheet::after {
        background-image: ${theme.pageGrid};
        background-size: 28px 28px;
        opacity: ${isNightMode ? "0.55" : "0.35"};
      }

      .help-sheet__scene,
      .help-sheet__scene-image,
      .help-sheet__scene-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .help-sheet__scene {
        z-index: 0;
        overflow: hidden;
      }

      .help-sheet__scene-image {
        background-image: url("${backgroundImageUrl}");
        background-size: cover;
        background-position: center center;
        opacity: ${theme.sceneOpacity};
        filter: ${theme.sceneFilter};
        transform: scale(1.06);
      }

      .help-sheet__scene-overlay {
        background: ${theme.sceneGlow}, ${theme.sceneMask};
      }

      .help-shell {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: ${isCompact ? "14px" : "18px"};
        min-height: calc(100vh - ${isCompact ? "36px" : "48px"});
        border-radius: 30px;
        border: 1px solid ${theme.shellBorder};
        box-shadow: ${theme.shellShadow};
        padding: ${isCompact ? "14px" : "18px"};
        background: ${theme.shellBg};
        backdrop-filter: blur(10px) saturate(1.06);
      }

      .help-hero {
        position: relative;
        display: flex;
        align-items: center;
        gap: ${isCompact ? "16px" : "20px"};
        padding: ${isCompact ? "18px 18px 16px" : "24px 24px 22px"};
        border-radius: 26px;
        border: 1px solid ${theme.heroBorder};
        background: ${theme.heroBg};
        overflow: hidden;
      }

      .help-hero::before {
        content: "";
        position: absolute;
        inset: auto auto -42px -32px;
        width: 180px;
        height: 180px;
        border-radius: 999px;
        background: ${theme.heroGlow};
        filter: blur(4px);
      }

      .help-hero::after {
        content: "";
        position: absolute;
        inset: -70px -50px auto auto;
        width: 220px;
        height: 220px;
        border-radius: 999px;
        background: ${theme.heroGlow};
        filter: blur(18px);
      }

      .help-hero__logo {
        position: relative;
        z-index: 1;
        width: ${isCompact ? "90px" : "112px"};
        height: ${isCompact ? "90px" : "112px"};
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: transparent;
        border: none;
        box-shadow: none;
        overflow: hidden;
      }

      .help-hero__logo img {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 999px;
        box-shadow: 0 10px 24px ${isNightMode ? "rgba(0, 0, 0, 0.32)" : "rgba(15, 61, 71, 0.14)"};
        filter: saturate(1.04) contrast(1.03);
      }

      .help-hero__content {
        position: relative;
        z-index: 1;
        min-width: 0;
      }

      .help-hero__eyebrow {
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: ${theme.eyebrow};
      }

      .help-hero__title {
        margin: 0;
        font-size: ${isCompact ? "34px" : "40px"};
        line-height: 1.02;
        font-weight: 900;
        letter-spacing: -0.04em;
        color: ${theme.title};
      }

      .help-hero__subtitle {
        margin: 10px 0 0;
        max-width: 420px;
        font-size: ${isCompact ? "13px" : "15px"};
        line-height: 1.55;
        color: ${theme.subtitle};
      }

      .help-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: ${isCompact ? "12px" : "14px"};
      }

      .help-plugin {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-radius: ${isCompact ? "20px" : "22px"};
        border: 1px solid ${theme.panelBorder};
        background: ${theme.panelBg};
        box-shadow: ${theme.panelShadow};
        overflow: hidden;
      }

      .help-plugin__head {
        padding: ${isCompact ? "14px 14px 12px" : "16px 16px 14px"};
        border-bottom: 1px solid ${theme.panelBorder};
      }

      .help-plugin__title-row {
        display: flex;
        align-items: ${isCompact ? "center" : "flex-start"};
        gap: ${isCompact ? "8px" : "0"};
        flex-wrap: ${isCompact ? "nowrap" : "wrap"};
        min-width: 0;
      }

      .help-plugin__title {
        margin: 0;
        font-size: ${isCompact ? "15px" : "16px"};
        line-height: 1.3;
        font-weight: 800;
        color: ${theme.panelTitle};
      }

      .help-plugin__desc {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: ${theme.panelDesc};
      }

      .help-plugin__desc--inline {
        margin: 0;
        min-width: 0;
        flex: 1;
        display: inline-block;
        font-size: 11px;
        line-height: 1.3;
        color: ${theme.panelDesc};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .help-plugin__desc--inline::before {
        content: "·";
        display: inline-block;
        margin-right: 8px;
        color: ${theme.emptyText};
      }

      .help-plugin__body {
        padding: ${isCompact ? "7px" : "12px"};
      }

      .help-plugin__empty {
        padding: 20px 16px 22px;
        text-align: center;
        font-size: 12px;
        color: ${theme.emptyText};
      }

      .help-command {
        padding: ${isCompact ? "7px 10px" : "12px"};
        border-radius: ${isCompact ? "14px" : "16px"};
        background: ${theme.commandBg};
        border: 1px solid ${theme.commandBorder};
      }

      .help-command + .help-command {
        margin-top: ${isCompact ? "6px" : "10px"};
      }

      .help-command__top {
        display: flex;
        align-items: ${isCompact ? "center" : "flex-start"};
        justify-content: space-between;
        gap: 8px;
      }

      .help-command__main {
        min-width: 0;
        flex: 1;
        display: flex;
        align-items: baseline;
        gap: ${isCompact ? "8px" : "0"};
        flex-wrap: ${isCompact ? "nowrap" : "wrap"};
      }

      .help-command__name {
        flex-shrink: 0;
        font-family: "SF Mono", "JetBrains Mono", "Fira Code", monospace;
        font-size: ${isCompact ? "12px" : "13px"};
        line-height: 1.4;
        font-weight: 800;
        color: ${theme.commandTitle};
        word-break: ${isCompact ? "normal" : "break-word"};
      }

      .help-command__inline-desc {
        display: ${isCompact ? "inline" : "none"};
        font-size: 11px;
        line-height: 1.35;
        min-width: 0;
        flex: 1;
        color: ${theme.commandDesc};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .help-command__inline-desc::before {
        content: "·";
        display: inline-block;
        margin-right: 8px;
        color: ${theme.emptyText};
      }

      .help-command__desc {
        margin-top: 6px;
        font-size: ${isCompact ? "12px" : "13px"};
        line-height: 1.6;
        color: ${theme.commandDesc};
      }

      .help-role {
        flex-shrink: 0;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        line-height: 1.5;
        font-weight: 700;
        letter-spacing: 0.02em;
        border: 1px solid transparent;
      }

      .help-footer {
        display: flex;
        align-items: stretch;
        gap: 0;
        margin-top: auto;
        border-radius: 22px;
        border: 1px solid ${theme.footerBorder};
        background: ${theme.footerBg};
        overflow: hidden;
      }

      .help-footer__item {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: ${isCompact ? "14px 16px" : "16px 18px"};
      }

      .help-footer__item + .help-footer__item {
        border-left: 1px solid ${theme.divider};
      }

      .help-footer__icon {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: ${isNightMode ? "rgba(126, 231, 221, 0.08)" : "rgba(15, 118, 110, 0.08)"};
        color: ${theme.eyebrow};
        font-size: 18px;
      }

      .help-footer__label {
        font-size: 11px;
        line-height: 1.4;
        color: ${theme.footerLabel};
      }

      .help-footer__value {
        margin-top: 2px;
        font-family: "SF Mono", "JetBrains Mono", "Fira Code", monospace;
        font-size: ${isCompact ? "12px" : "13px"};
        line-height: 1.45;
        font-weight: 700;
        color: ${theme.footerText};
      }
    </style>
    <div class="help-sheet">
      <div class="help-sheet__scene">
        <div class="help-sheet__scene-image"></div>
        <div class="help-sheet__scene-overlay"></div>
      </div>
      <div class="help-shell">
        <header class="help-hero">
          <div class="help-hero__logo">
            <img src="${escapeHtml(avatarSrc)}" alt="logo" />
          </div>
          <div class="help-hero__content">
            <div class="help-hero__eyebrow">Mioku Assistant</div>
            <h1 class="help-hero__title">${escapeHtml(botNickname)}</h1>
            <p class="help-hero__subtitle">
              有什么不懂的尽管问我 O.o
            </p>
          </div>
        </header>

        <main class="help-grid">
          ${plugins}
        </main>

        <footer class="help-footer">
          <div class="help-footer__item">
            <div class="help-footer__icon">⚡</div>
            <div>
              <div class="help-footer__label">Framework</div>
              <div class="help-footer__value">Mioki ${escapeHtml(miokiVersion)}</div>
            </div>
          </div>
          <div class="help-footer__item">
            <div class="help-footer__icon">🚀</div>
            <div>
              <div class="help-footer__label">Platform</div>
              <div class="help-footer__value">Mioku ${escapeHtml(miokuVersion)}</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  `;
}

function renderRoleBadge(role: CommandRole, isNightMode: boolean): string {
  const config = ROLE_CONFIG[role];
  if (!config) {
    return "";
  }

  const background = isNightMode ? config.badgeBgDark : config.badgeBgLight;
  const border = isNightMode ? config.badgeBorderDark : config.badgeBorderLight;
  const color = isNightMode ? config.badgeTextDark : config.badgeTextLight;

  return `<span class="help-role" style="background: ${background}; border-color: ${border}; color: ${color};">${config.label}</span>`;
}

function resolveCompactMode(pluginCount: number): boolean {
  return pluginCount > 8;
}

export function resolveHelpBotProfile(
  ctx: any,
  event?: any,
): { botNickname: string; botAvatarUrl?: string } {
  const fallbackNickname = "Mioku Bot";
  const selfId = event?.self_id;
  const bot =
    (selfId && typeof ctx?.pickBot === "function" ? ctx.pickBot(selfId) : null) ||
    (ctx?.bots instanceof Map ? Array.from(ctx.bots.values())[0] : null);
  const botId = selfId || bot?.uin || bot?.user_id || bot?.self_id;
  const botNickname = bot?.nickname || bot?.name || fallbackNickname;
  const botAvatarUrl = botId
    ? `https://q1.qlogo.cn/g?b=qq&nk=${botId}&s=640`
    : undefined;

  return { botNickname, botAvatarUrl };
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

function normalizeImageSource(file: string): string {
  const value = String(file || "").trim();
  if (!value) {
    return value;
  }

  if (
    value.startsWith("file://") ||
    value.startsWith("base64://") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }

  if (isLocalFilePath(value)) {
    return `file://${value}`;
  }

  return value;
}

function isLocalFilePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}
