import type { EventIdentity } from "mioku";

export class AdapterEventDeduplicator {
  readonly #ttl: number;
  readonly #maxSize: number;
  readonly #entries = new Map<string, number>();
  #dropped = 0;

  constructor(options: { ttl?: number; maxSize?: number } = {}) {
    this.#ttl = options.ttl ?? 60_000;
    this.#maxSize = options.maxSize ?? 4096;
  }

  /** 本次运行以来被丢弃的重复事件数 */
  get dropped(): number {
    return this.#dropped;
  }

  #buildKey(identity: EventIdentity): string | null {
    const strong = identity.message_id ?? identity.native_event_id;
    if (strong) {
      return [
        identity.adapter ?? "",
        identity.bot_id ?? "",
        identity.event_type ?? "",
        strong,
      ].join("|");
    }
    if (identity.fingerprint) {
      return [
        identity.adapter ?? "",
        identity.bot_id ?? "",
        identity.event_type ?? "",
        identity.source_id ?? "",
        identity.fingerprint,
        identity.timestamp?.toString() ?? "",
      ].join("|");
    }
    return null;
  }

  isDuplicate(identity: EventIdentity): boolean {
    this.#prune();
    const key = this.#buildKey(identity);
    if (key === null) return false;
    if (this.#entries.has(key)) {
      this.#dropped++;
      return true;
    }
    this.#entries.set(key, Date.now());
    if (this.#entries.size > this.#maxSize) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    return false;
  }

  #prune(): void {
    const now = Date.now();
    for (const [key, ts] of this.#entries) {
      if (now - ts <= this.#ttl) break;
      this.#entries.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
