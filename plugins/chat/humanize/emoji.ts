import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { logger } from "mioki";
import type { ChatDatabase } from "../db";
import type { ChatConfig } from "../types";

export class EmojiSystem {
  private client: OpenAI;
  private config: ChatConfig;
  private db: ChatDatabase;
  private initialized = false;

  constructor(client: OpenAI, config: ChatConfig, db: ChatDatabase) {
    this.client = client;
    this.config = config;
    this.db = db;
  }

  async init(): Promise<void> {
    if (!this.config.emoji?.enabled) return;
    if (this.initialized) return;

    const emojiDir = this.config.emoji.emojiDir;
    if (!emojiDir || !fs.existsSync(emojiDir)) {
      logger.warn(`[表情包] 目录不存在: ${emojiDir}`);
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

    logger.info(`[表情包] 发现 ${newFiles.length} 个新表情包，开始注册...`);

    const batch = newFiles.slice(0, 10);
    for (const fileName of batch) {
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
        logger.warn(`[表情包] 注册失败 ${fileName}: ${err}`);
      }
    }

    this.initialized = true;
    logger.info(`[表情包] 注册完成，共 ${batch.length} 个`);
  }

  async pickEmoji(replyContent: string): Promise<string | null> {
    if (!this.config.emoji?.enabled) return null;
    if (Math.random() > (this.config.emoji.sendProbability ?? 0.2)) return null;

    const emotion = await this.detectEmotion(replyContent);
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

      logger.info(`[表情包] 收集新表情: ${fileName} (${emotion.emotion})`);
    } catch (err) {
      logger.warn(`[表情包] 收集失败: ${err}`);
    }
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

        const resp = await this.client.chat.completions.create({
          model: this.config.model,
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
                  text: `这是一个表情包/表情图片。请分析它表达的情感。
严格以 JSON 格式输出：
{"description": "简短描述", "emotion": "情感标签"}
情感标签只能是以下之一：happy, sad, angry, surprised, disgusted, scared, neutral, funny, cute, confused, excited, tired, love`,
                },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 150,
        });

        const content = resp.choices[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        logger.warn(`[表情包] 图像分析失败: ${err}`);
      }
    }

    const name = path.basename(filePath, path.extname(filePath));
    return { description: name, emotion: "neutral" };
  }

  private async detectEmotion(text: string): Promise<string | null> {
    try {
      const resp = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: `分析以下文本的情感，只输出一个情感标签。
可选标签：happy, sad, angry, surprised, disgusted, scared, neutral, funny, cute, confused, excited, tired, love
只输出标签，不要其他内容。`,
          },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: 20,
      });

      return resp.choices[0]?.message?.content?.trim().toLowerCase() || null;
    } catch {
      return null;
    }
  }
}
