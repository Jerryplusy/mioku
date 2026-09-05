import type { Event, MessageEvent, NoticeEvent, RequestEvent } from "../adapter";

interface Entry {
  expiresAt: number;
}

const PRUNE_INTERVAL = 128;
const MESSAGE_TTL_MS = 15_000;
const EVENT_TTL_MS = 60_000;
const MAX_SIZE = 4096;
const MAX_SEGMENTS = 16;
const MAX_TEXT = 256;

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
      parts.push("f");
    } else {
      parts.push(seg.type);
    }
  }
  return parts.join("|");
};

const scopeKeyOf = (event: MessageEvent, content: string): string =>
  [
    event.message_type ?? "",
    event.sender?.nickname?.trim() || event.user_id || "",
    content,
  ].join("|");

const noticeKeyOf = (event: NoticeEvent): string =>
  [
    event.kind,
    event.identity.event_type,
    event.notice_type ?? "",
    event.sub_type ?? "",
    event.group_id ?? "",
    event.user_id ?? "",
    event.operator_id ?? "",
    event.identity.fingerprint ?? "",
    event.identity.timestamp == null ? "" : Math.floor(event.identity.timestamp / 1000),
  ].join("|");

const requestKeyOf = (event: RequestEvent): string =>
  [
    event.kind,
    event.identity.event_type,
    event.request_type ?? "",
    event.sub_type ?? "",
    event.group_id ?? "",
    event.user_id ?? "",
    event.comment ?? "",
    event.identity.fingerprint ?? "",
    event.identity.timestamp == null ? "" : Math.floor(event.identity.timestamp / 1000),
  ].join("|");

/**
 * 跨适配器消息去重（L2）
 */
export class CrossAdapterEventDeduplicator {
  readonly #entries = new Map<string, Entry>();
  #inserts = 0;
  #dropped = 0;

  /** 本次运行以来被丢弃的跨适配器重复消息数 */
  get dropped(): number {
    return this.#dropped;
  }

  isDuplicate(event: Event): boolean {
    let key: string;
    let ttl: number;
    if (event.kind === "message") {
      key = scopeKeyOf(event, contentFingerprintOf(event));
      ttl = MESSAGE_TTL_MS;
    } else if (event.kind === "notice") {
      key = noticeKeyOf(event);
      ttl = EVENT_TTL_MS;
    } else if (event.kind === "request") {
      key = requestKeyOf(event);
      ttl = EVENT_TTL_MS;
    } else {
      return false;
    }
    const now = Date.now();

    const existing = this.#entries.get(key);
    if (existing?.expiresAt != null && existing.expiresAt >= now) {
      this.#dropped++;
      return true;
    }

    this.#entries.set(key, { expiresAt: now + ttl });
    this.#inserts++;
    if (this.#inserts >= PRUNE_INTERVAL || this.#entries.size > MAX_SIZE) {
      this.#inserts = 0;
      this.#prune(now);
    }
    return false;
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt < now) this.#entries.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
