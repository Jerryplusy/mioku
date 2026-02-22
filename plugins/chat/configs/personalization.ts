import type {
  PersonalityConfig,
  ReplyStyleConfig,
  MemoryConfig,
  TopicConfig,
  PlannerConfig,
  FrequencyConfig,
  TypoConfig,
  EmojiConfig,
  ExpressionConfig,
} from "../types";

export const PERSONALIZATION_CONFIG: {
  personality: PersonalityConfig;
  replyStyle: ReplyStyleConfig;
  memory: MemoryConfig;
  topic: TopicConfig;
  planner: PlannerConfig;
  frequency: FrequencyConfig;
  typo: TypoConfig;
  emoji: EmojiConfig;
  expression: ExpressionConfig;
} = {
  personality: {
    states: [],
    stateProbability: 0.3,
  },
  replyStyle: {
    baseStyle: "",
    multipleStyles: [],
    multipleProbability: 0.3,
  },
  memory: {
    enabled: true,
    maxIterations: 3,
    timeoutMs: 15000,
  },
  topic: {
    enabled: true,
    messageThreshold: 50,
    timeThresholdMs: 8 * 3600_000,
    maxTopicsPerSession: 20,
  },
  planner: {
    enabled: true,
  },
  frequency: {
    enabled: true,
    minIntervalMs: 3000,
    maxIntervalMs: 10000,
    speakProbability: 0.85,
    quietHoursStart: 23,
    quietHoursEnd: 7,
    quietProbabilityMultiplier: 0.3,
  },
  typo: {
    enabled: true,
    errorRate: 0.03,
    wordReplaceRate: 0.1,
  },
  emoji: {
    enabled: false,
    emojiDir: "",
    sendProbability: 0.15,
  },
  expression: {
    enabled: true,
    maxExpressions: 100,
    sampleSize: 8,
  },
};

export default PERSONALIZATION_CONFIG;
