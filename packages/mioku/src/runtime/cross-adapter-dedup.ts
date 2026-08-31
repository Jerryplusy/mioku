import type { Event, MessageEvent } from "../adapter";

interface Entry {
  adapter: string;
  bucket: number;
  at: number;
}

const BUCKET_SLACK = 1;
const PRUNE_INTERVAL = 128;
const TTL_MS = 15_000;
const MAX_SIZE = 4096;
const MAX_SEGMENTS = 16;
const MAX_TEXT = 256;

/**
 * 把消息段序列化为跨适配器稳定的内容指纹：
 * 文本/@/表情取内容，媒体段只取类型（url/文件名跨协议不稳定）
 */
const contentFingerprintOf = (event: MessageEvent): string => {
  const parts: string[] = [];
  for (const seg of event.message) {
    if (parts.length >= MAX_SEGMENTS) break;
    if (seg.type === "reply") continue;
    const data = seg.data ?? {};
    if (seg.type === "text") {
      const text = typeof data.text === "string" ? data.text : "";
      parts.push(`t:${text.slice(0, MAX_TEXT)}`);
    } else if (seg.type === "at") {
      const target = data.qq ?? data.target;
      parts.push(`a:${target == null ? "" : String(target)}`);
    } else if (seg.type === "face") {
      parts.push(`f:${data.id == null ? "" : String(data.id)}`);
    } else {
      parts.push(seg.type);
    }
  }
  return parts.join("|");
};

const scopeKeyOf = (event: MessageEvent, content: string): string =>
  [
    event.self_id ?? "",
    event.message_type ?? "",
    event.group_id ?? event.user_id ?? "",
    event.user_id ?? "",
    content,
  ].join("|");

/**
 * 跨适配器消息去重（L2）
 */
export class CrossAdapterMessageDeduplicator {
  readonly #entries = new Map<string, Entry>();
  #inserts = 0;
  #dropped = 0;

  /** 本次运行以来被丢弃的跨适配器重复消息数 */
  get dropped(): number {
    return this.#dropped;
  }

  isDuplicate(event: Event): boolean {
    if (event.kind !== "message") return false;
    const messageEvent = event as MessageEvent;
    const adapter = messageEvent.identity?.adapter ?? "";
    const now = Date.now();
    const bucket = Math.floor((messageEvent.time ?? now) / 1000);
    const key = scopeKeyOf(messageEvent, contentFingerprintOf(messageEvent));

    const existing = this.#entries.get(key);
    if (existing) {
      if (Math.abs(existing.bucket - bucket) <= BUCKET_SLACK) {
        if (existing.adapter !== adapter) {
          this.#dropped++;
          return true;
        }
        existing.bucket = bucket;
        existing.at = now;
        return false;
      }
      existing.bucket = bucket;
      existing.at = now;
      existing.adapter = adapter;
      return false;
    }

    this.#entries.set(key, { adapter, bucket, at: now });
    this.#inserts++;
    if (this.#inserts >= PRUNE_INTERVAL || this.#entries.size > MAX_SIZE) {
      this.#inserts = 0;
      this.#prune(now);
    }
    return false;
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (now - entry.at > TTL_MS) this.#entries.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
