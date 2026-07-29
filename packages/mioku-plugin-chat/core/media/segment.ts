import type { AIInstance } from "mioku";
import type { ChatConfig, MediaSummaryRecord } from "../../types";
import type { HistoryMediaOptions } from "../../manage/types";
import {
  getSegmentSourceCandidates,
  type HistoryMediaProcessingOptions,
  type MediaMessageSegment,
} from "./history-media";

export { getSegmentSourceCandidates };

export function buildHistoryMediaOptions(
  ai: AIInstance,
  config: ChatConfig,
): HistoryMediaOptions {
  return {
    ai,
    workingModel: config.workingModel || config.model,
    multimodalWorkingModel: config.multimodalWorkingModel || config.model,
  };
}

export function buildHistoryMediaProcessingOptions(
  ai: AIInstance,
  config: ChatConfig,
  db: {
    getMediaSummary(key: string): MediaSummaryRecord | null;
    saveMediaSummary(summary: MediaSummaryRecord): void;
  },
  bot: {
    api<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T>;
  },
  groupId: number,
  log: HistoryMediaProcessingOptions["logger"],
  runAIRequest?: <T>(request: () => Promise<T>) => Promise<T | null>,
): HistoryMediaProcessingOptions {
  return {
    ...buildHistoryMediaOptions(ai, config),
    db,
    logger: log,
    bot,
    groupId,
    runAIRequest,
  };
}

export function getSegmentUrl(seg: {
  url?: string;
  data?: { url?: string };
}): string | null {
  const url = seg?.url || seg?.data?.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

export async function getVideoSourceCandidatesFromMessage(
  bot: {
    api(action: string, params?: Record<string, unknown>): Promise<unknown>;
  },
  messageId: number | string | undefined,
): Promise<string[]> {
  if (messageId == null) return [];
  const result = (await bot.api("get_msg", { message_id: messageId })) as {
    message?: unknown[];
    data?: { message?: unknown[] };
  };
  const segments = result?.message || result?.data?.message || [];
  if (!Array.isArray(segments)) return [];
  const candidates: string[] = [];
  for (const seg of segments as MediaMessageSegment[]) {
    if (seg?.type !== "video") continue;
    candidates.push(...getSegmentSourceCandidates(seg));
  }
  return candidates;
}

export function getForwardId(seg: {
  id?: unknown;
  data?: { id?: unknown };
}): string | null {
  return String(seg?.id || seg?.data?.id || "");
}

export function getCardData(seg: unknown): string | null {
  const data = (seg as { data?: unknown } | null | undefined)?.data;
  if (!data) return null;
  return typeof data === "string" ? data : JSON.stringify(data);
}

export function isMediaAnalysisBlocked(config: ChatConfig, userId: number): boolean {
  return Boolean(config.mediaAnalysisBlacklistUsers?.includes(userId));
}
