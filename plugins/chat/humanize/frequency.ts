import type { ChatConfig } from "../types";

export class FrequencyController {
  private config: ChatConfig;
  private lastSpeakTime: Map<string, number> = new Map();
  private consecutiveNoReply: Map<string, number> = new Map();

  constructor(config: ChatConfig) {
    this.config = config;
  }

  shouldSpeak(sessionId: string): boolean {
    if (!this.config.frequency?.enabled) return true;

    const now = Date.now();
    const lastSpeak = this.lastSpeakTime.get(sessionId) ?? 0;
    const minInterval = this.config.frequency.minIntervalMs ?? 5000;

    if (now - lastSpeak < minInterval) {
      return false;
    }

    let probability = this.config.frequency.speakProbability ?? 0.8;

    const hour = new Date().getHours();
    const quietStart = this.config.frequency.quietHoursStart ?? 23;
    const quietEnd = this.config.frequency.quietHoursEnd ?? 7;
    const isQuietHour =
      quietStart > quietEnd
        ? hour >= quietStart || hour < quietEnd
        : hour >= quietStart && hour < quietEnd;

    if (isQuietHour) {
      probability *= this.config.frequency.quietProbabilityMultiplier ?? 0.3;
    }

    const noReplyCount = this.consecutiveNoReply.get(sessionId) ?? 0;
    if (noReplyCount >= 3) {
      probability = Math.min(probability + 0.2 * (noReplyCount - 2), 1.0);
    }

    const shouldSpeak = Math.random() < probability;

    if (!shouldSpeak) {
      this.consecutiveNoReply.set(sessionId, noReplyCount + 1);
    }

    return shouldSpeak;
  }

  recordSpeak(sessionId: string): void {
    this.lastSpeakTime.set(sessionId, Date.now());
    this.consecutiveNoReply.set(sessionId, 0);
  }

  getTypingDelay(messageLength: number): number {
    if (!this.config.frequency?.enabled) return 0;

    const baseDelay = 1000 + Math.random() * 2000;
    const typingTime = messageLength * (50 + Math.random() * 50);
    const maxDelay = this.config.frequency.maxIntervalMs ?? 10000;

    return Math.min(baseDelay + typingTime, maxDelay);
  }
}
