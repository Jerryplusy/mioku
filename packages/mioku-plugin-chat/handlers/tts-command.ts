import type { SupportedLang } from "mioku-service-audio";
import type { ChatPluginContext } from "../context";

function detectLang(text: string): SupportedLang {
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  return "en";
}

export async function handleTtsCommand(
  pluginCtx: ChatPluginContext,
  e: any,
  payload: string,
): Promise<void> {
  const { ctx } = pluginCtx;
  const isOwner = ctx.isOwner?.(e) ?? false;
  if (!isOwner) {
    await e.reply("只有主人才能使用 /tts 指令~");
    return;
  }

  const text = String(payload || "").trim();
  if (!text) {
    await e.reply("用法: /tts <要合成的文本>");
    return;
  }

  const audioService = pluginCtx.audioService;
  if (!audioService) {
    await e.reply("audio 服务未加载");
    return;
  }

  const isReady = await audioService.ready().catch(() => false);
  if (!isReady) {
    await e.reply("audio 服务正在启动/失败，请稍后再试");
    return;
  }

  let result;
  try {
    result = await audioService.generateByText({
      text,
      textLang: detectLang(text),
      mediaType: "wav",
    });
  } catch (err: any) {
    ctx.logger.error(`[tts-cmd] 推理失败: ${err?.message ?? err}`);
    await e.reply(`TTS 推理失败: ${err?.message ?? err}`);
    return;
  }

  if (!result?.filePath) {
    await e.reply("TTS 推理未返回音频文件");
    return;
  }

  const source = result.filePath.startsWith("file://")
    ? result.filePath
    : `file://${result.filePath}`;
  await e.reply([ctx.segment.record(source)]);
}
