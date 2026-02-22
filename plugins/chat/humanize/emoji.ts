import type { AIInstance } from "../../../src/services/ai";
import * as fs from "fs";
import * as path from "path";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig } from "../types";

const QUICK_EMOTION_RULES: [string[], string][] = [
  [["哈哈", "笑死", "lol", "233", "草", "xswl", "笑"], "funny"],
  [["好可爱", "可爱", "萌", "aww"], "cute"],
  [["难过", "伤心", "哭", "呜", "555", "QAQ"], "sad"],
  [["生气", "气死", "烦", "滚", "cnm"], "angry"],
  [["爱", "喜欢", "❤", "么么"], "love"],
  [["累", "困", "睡", "摸鱼"], "tired"],
  [["！！", "天哪", "卧槽", "woc", "震惊"], "surprised"],
  [["开心", "耶", "好耶", "太好了", "nice"], "happy"],
];

export class EmojiSystem {
  private ai: AIInstance;
  private config: ChatConfig;
  private db: ChatDatabase;
  private initialized = false;

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.ai = ai;
    this.config = config;
    this.db = db;
  }

  async init(): Promise<void> {
    if (!this.config.emoji?.enabled) return;
    if (this.initialized) return;

    const emojiDir = this.config.emoji.emojiDir;
    if (!emojiDir || !fs.existsSync(emojiDir)) {
      logger.warn(`[EmojiSystem] Directory not found: ${emojiDir}`);
      return;
    }

    const existingEmojis = this.db.getAllEmojis();
    const existingFiles = new Set(existingEmojis.map((e) => e.fileName));

    const files = fs.readdirSync(emojiDir).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
    });

    const newFiles = files.filter((f) => !existingFiles.has(f));
    if (newFiles.length === 0) {
      this.initialized = true;
      return;
    }

    logger.info(
      `[EmojiSystem] Found ${newFiles.length} new emojis, registering...`,
    );

    // Process all new files (no batch limit)
    for (const fileName of newFiles) {
      try {
        const filePath = path.join(emojiDir, fileName);
        const emotion = await this.analyzeEmotion(filePath);
        this.db.saveEmoji({
          fileName,
          description: emotion.description,
          emotion: emotion.emotion,
          usageCount: 0,
          createdAt: Date.now(),
        });
      } catch (err) {
        logger.warn(`[EmojiSystem] Registration failed ${fileName}: ${err}`);
      }
    }

    this.initialized = true;
    logger.info(
      `[EmojiSystem] Registration complete, ${newFiles.length} total`,
    );
  }

  async pickEmoji(replyContent: string): Promise<string | null> {
    if (!this.config.emoji?.enabled) return null;
    if (Math.random() > (this.config.emoji.sendProbability ?? 0.2)) return null;

    // Try quick keyword detection first
    let emotion = this.quickDetectEmotion(replyContent);

    // Fall back to AI detection
    if (!emotion) {
      emotion = await this.detectEmotion(replyContent);
    }
    if (!emotion) return null;

    const emojis = this.db.getEmojiByEmotion(emotion, 5);
    if (emojis.length === 0) {
      const fallback = this.db.getEmojiByEmotion("neutral", 3);
      if (fallback.length === 0) return null;
      const picked = fallback[Math.floor(Math.random() * fallback.length)];
      if (picked.id) this.db.incrementEmojiUsage(picked.id);
      return path.join(this.config.emoji.emojiDir, picked.fileName);
    }

    const maxUsage = Math.max(...emojis.map((e) => e.usageCount)) + 1;
    const weights = emojis.map((e) => maxUsage - e.usageCount + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let picked = emojis[0];
    for (let i = 0; i < emojis.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        picked = emojis[i];
        break;
      }
    }

    if (picked.id) this.db.incrementEmojiUsage(picked.id);
    return path.join(this.config.emoji.emojiDir, picked.fileName);
  }

  async collectFromMessage(imageUrl: string, fileName: string): Promise<void> {
    if (!this.config.emoji?.enabled) return;

    const emojiDir = this.config.emoji.emojiDir;
    if (!emojiDir) return;

    if (!fs.existsSync(emojiDir)) {
      fs.mkdirSync(emojiDir, { recursive: true });
    }

    const targetPath = path.join(emojiDir, fileName);
    if (fs.existsSync(targetPath)) return;

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return;
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(targetPath, buffer);

      const emotion = await this.analyzeEmotion(targetPath);
      this.db.saveEmoji({
        fileName,
        description: emotion.description,
        emotion: emotion.emotion,
        usageCount: 0,
        createdAt: Date.now(),
      });

      logger.info(
        `[EmojiSystem] Collected new emoji: ${fileName} (${emotion.emotion})`,
      );
    } catch (err) {
      logger.warn(`[EmojiSystem] Collection failed: ${err}`);
    }
  }

  private quickDetectEmotion(text: string): string | null {
    for (const [keywords, emotion] of QUICK_EMOTION_RULES) {
      if (keywords.some((k) => text.includes(k))) return emotion;
    }
    return null;
  }

  private async analyzeEmotion(
    filePath: string,
  ): Promise<{ description: string; emotion: string }> {
    if (this.config.isMultimodal) {
      try {
        const imageData = fs.readFileSync(filePath);
        const base64 = imageData.toString("base64");
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        const mimeType =
          ext === "jpg"
            ? "image/jpeg"
            : ext === "gif"
              ? "image/gif"
              : `image/${ext}`;

        const content = await this.ai.generateMultimodal({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64}`,
                  },
                },
                {
                  type: "text",
                  text: `This is a sticker/emoji image. Analyze the emotion it expresses.
Output strictly in JSON format:
{"description": "brief description", "emotion": "emotion label"}
Emotion label must be one of: happy, sad, angry, surprised, disgusted, scared, neutral, funny, cute, confused, excited, tired, love`,
                },
              ],
            },
          ],
          model: this.config.workingModel || this.config.model,
          temperature: 0.3,
          max_tokens: 150,
        });

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        logger.warn(`[EmojiSystem] Image analysis failed: ${err}`);
      }
    }

    const name = path.basename(filePath, path.extname(filePath));
    return { description: name, emotion: "neutral" };
  }

  private async detectEmotion(text: string): Promise<string | null> {
    try {
      const result = await this.ai.generateText({
        prompt: `Analyze the emotion of the following text. Output only one emotion label.
Available labels: happy, sad, angry, surprised, disgusted, scared, neutral, funny, cute, confused, excited, tired, love
Output only the label, nothing else.`,
        messages: [{ role: "user", content: text }],
        model: this.config.workingModel || this.config.model,
        temperature: 0.3,
        max_tokens: 20,
      });

      return result.trim().toLowerCase() || null;
    } catch {
      return null;
    }
  }
}
