import type { AudioServiceApi, SupportedLang } from "mioku-service-audio";

function detectAudioLanguage(text: string): SupportedLang {
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  return "en";
}

export async function synthesizeAudioSource(
  audioService: AudioServiceApi | undefined,
  text: string,
): Promise<string | null> {
  const trimmed = String(text || "").trim();
  if (!audioService) return null;
  if (!trimmed) return null;

  const isReady = await audioService.ready().catch(() => false);
  if (!isReady) return null;

  const result = await audioService.generateByText({
    text: trimmed,
    textLang: detectAudioLanguage(trimmed),
    mediaType: "wav",
  });

  if (!result?.filePath) return null;
  return result.filePath.startsWith("file://")
    ? result.filePath
    : `file://${result.filePath}`;
}
