import type { RateLimiter } from "./rate-limiter";

const RATE_LIMIT_RETRY_DELAY_MS = 5_000;
const RATE_LIMIT_MAX_RETRIES = 2;

type Logger = { warn: (...args: unknown[]) => void };

// Wraps an AI request with global rate-limit blocking + per-user/group RPM
// limiting. On a 429 it backs off and retries up to RATE_LIMIT_MAX_RETRIES.
export class RateLimitGuard {
  private blockedUntil = 0;

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly log: Logger,
  ) {}

  isBlocked(): boolean {
    return Date.now() < this.blockedUntil;
  }

  private markBlocked(): void {
    this.blockedUntil = Date.now() + RATE_LIMIT_RETRY_DELAY_MS;
  }

  private isRateLimitError(err: unknown): boolean {
    const s = String(err).toLowerCase();
    return s.includes("429") || s.includes("rate limit");
  }

  async run<T>(
    request: () => Promise<T>,
    opts?: { userId?: number; groupId?: number; label?: string },
  ): Promise<T | null> {
    if (this.isBlocked()) {
      this.log.warn(
        `[Chat] AI request skipped due to rate limit block${opts?.label ? ` (${opts.label})` : ""}`,
      );
      return null;
    }
    if (!this.rateLimiter.canRunAIRequest(opts?.userId, opts?.groupId)) {
      this.log.warn(
        `[Chat] AI request skipped due to RPM limit${opts?.label ? ` (${opts.label})` : ""}`,
      );
      return null;
    }
    this.rateLimiter.recordAIRequest(opts?.userId, opts?.groupId);

    let retries = 0;
    while (true) {
      try {
        const result = await request();
        this.blockedUntil = 0;
        return result;
      } catch (err) {
        if (!this.isRateLimitError(err)) throw err;
        this.markBlocked();
        if (retries >= RATE_LIMIT_MAX_RETRIES) throw err;
        retries += 1;
        this.log.warn(
          `[Chat] Rate limit hit, waiting ${RATE_LIMIT_RETRY_DELAY_MS / 1000}s...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS),
        );
        if (this.isBlocked()) this.blockedUntil = 0;
      }
    }
  }
}
