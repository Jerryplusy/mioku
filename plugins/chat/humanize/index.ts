export { MemoryRetrieval } from "./memory";
export { TopicTracker } from "./topic";
export { ActionPlanner } from "./planner";
export { FrequencyController } from "./frequency";
export { TypoGenerator } from "./typo";
export { EmojiSystem } from "./emoji";
export { ExpressionLearner } from "./expression";
export { pickReplyStyle, pickPersonalityState } from "./utils";

import type { AIInstance } from "../../../src/services/ai";
import type { ChatDatabase } from "../db";
import type { ChatConfig } from "../types";
import { MemoryRetrieval } from "./memory";
import { TopicTracker } from "./topic";
import { ActionPlanner } from "./planner";
import { FrequencyController } from "./frequency";
import { TypoGenerator } from "./typo";
import { EmojiSystem } from "./emoji";
import { ExpressionLearner } from "./expression";

export class HumanizeEngine {
  readonly memoryRetrieval: MemoryRetrieval;
  readonly topicTracker: TopicTracker;
  readonly actionPlanner: ActionPlanner;
  readonly frequencyController: FrequencyController;
  readonly typoGenerator: TypoGenerator;
  readonly emojiSystem: EmojiSystem;
  readonly expressionLearner: ExpressionLearner;

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.memoryRetrieval = new MemoryRetrieval(ai, config, db);
    this.topicTracker = new TopicTracker(ai, config, db);
    this.actionPlanner = new ActionPlanner(ai, config);
    this.frequencyController = new FrequencyController(config);
    this.typoGenerator = new TypoGenerator(config);
    this.emojiSystem = new EmojiSystem(ai, config, db);
    this.expressionLearner = new ExpressionLearner(ai, config, db);
  }

  async init(): Promise<void> {
    await this.emojiSystem.init();
  }
}
