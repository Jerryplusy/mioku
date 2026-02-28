export { EmojiAgent } from "./emoji-agent";
export { MemoryRetrieval } from "./memory";
export { TopicTracker } from "./topic";
export { ActionPlanner } from "./planner";
export { TypoGenerator } from "./typo";
export { ExpressionLearner } from "./expression";
export { pickReplyStyle, pickPersonalityState } from "./utils";

import type { AIInstance } from "../../../src/services/ai";
import type { ChatDatabase } from "../db";
import type { ChatConfig } from "../types";
import { EmojiAgent } from "./emoji-agent";
import { MemoryRetrieval } from "./memory";
import { TopicTracker } from "./topic";
import { ActionPlanner } from "./planner";
import { TypoGenerator } from "./typo";
import { ExpressionLearner } from "./expression";

export class HumanizeEngine {
  readonly memoryRetrieval: MemoryRetrieval;
  readonly topicTracker: TopicTracker;
  readonly actionPlanner: ActionPlanner;
  readonly typoGenerator: TypoGenerator;
  readonly emojiAgent: EmojiAgent;
  readonly expressionLearner: ExpressionLearner;

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.memoryRetrieval = new MemoryRetrieval(ai, config, db);
    this.topicTracker = new TopicTracker(ai, config, db);
    this.actionPlanner = new ActionPlanner(ai, config);
    this.typoGenerator = new TypoGenerator(config);
    this.emojiAgent = new EmojiAgent(ai, config, db);
    this.expressionLearner = new ExpressionLearner(ai, config, db);
  }

  async init(): Promise<void> {
    // emojiAgent 不需要初始化，它直接从文件系统读取
  }
}
