import type { AIInstance } from "../../../src/services/ai";
import type { ChatDatabase } from "../db";
import type { ChatConfig, ChatMessage } from "../types";
import { logger } from "mioki";
import * as fs from "fs";
import * as path from "path";

export interface EmojiPickResult {
  success: boolean;
  emojiPath?: string;
  emojiDescription?: string;
  cleanedText?: string;
  error?: string;
}

const AVAILABLE_EMOTIONS = [
  "happy",
  "sad",
  "angry",
  "surprised",
  "confused",
  "excited",
  "tired",
  "shy",
  "proud",
  "default",
  "funny",
  "cute",
  "love",
  "neutral",
];

export class EmojiAgent {
  private ai: AIInstance;
  private config: ChatConfig;
  private db: ChatDatabase;
  private memeBaseDir: string;

  constructor(ai: AIInstance, config: ChatConfig, db: ChatDatabase) {
    this.ai = ai;
    this.config = config;
    this.db = db;
    this.memeBaseDir = path.join(process.cwd(), "data", "chat", "meme");
  }

  getAvailableCharacters(): string[] {
    if (!fs.existsSync(this.memeBaseDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.memeBaseDir, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    return dirs;
  }

  getAvailableEmotions(character: string): string[] {
    const characterDir = path.join(this.memeBaseDir, character);
    if (!fs.existsSync(characterDir)) {
      return [];
    }

    const entries = fs.readdirSync(characterDir, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    return dirs;
  }

  async getAvailableCharactersAsync(): Promise<string[]> {
    return this.getAvailableCharacters();
  }

  async getAvailableEmotionsAsync(character: string): Promise<string[]> {
    return this.getAvailableEmotions(character);
  }

  parseMemeIntent(text: string): { character: string; emotion: string } | null {
    const regex = /\[meme:([^:]+):([^\]]+)\]/i;
    const match = text.match(regex);
    if (!match) return null;

    return {
      character: match[1].trim().toLowerCase(),
      emotion: match[2].trim().toLowerCase(),
    };
  }

  async processMemeResponse(
    aiResponseText: string,
    sessionId: string,
  ): Promise<EmojiPickResult> {
    const intent = this.parseMemeIntent(aiResponseText);
    if (!intent) {
      return {
        success: false,
        error: "No meme intent found in response",
      };
    }

    const chatHistory = this.db.getMessages(sessionId, 20);

    const emojiResult = await this.pickEmoji(
      intent.character,
      intent.emotion,
      chatHistory,
    );

    if (!emojiResult.success || !emojiResult.emojiPath) {
      return {
        success: false,
        error: emojiResult.error || "Failed to pick emoji",
      };
    }

    const cleanedText = this.cleanMemeMarker(aiResponseText);

    return {
      success: true,
      emojiPath: emojiResult.emojiPath,
      emojiDescription: emojiResult.description,
      cleanedText,
    };
  }

  async pickEmoji(
    character: string,
    emotion: string,
    chatHistory: ChatMessage[],
  ): Promise<{
    success: boolean;
    emojiPath?: string;
    description?: string;
    error?: string;
  }> {
    try {
      const normalizedEmotion = this.normalizeEmotion(emotion);
      const characterDir = path.join(
        this.memeBaseDir,
        character,
        normalizedEmotion,
      );

      if (!fs.existsSync(characterDir)) {
        logger.warn(
          `[emoji-agent] Directory not found: ${characterDir}, trying default emotion`,
        );
        const defaultDir = path.join(this.memeBaseDir, character, "default");
        if (fs.existsSync(defaultDir)) {
          return this.selectFromDirectory(
            defaultDir,
            character,
            normalizedEmotion,
            chatHistory,
          );
        }

        const neutralDir = path.join(this.memeBaseDir, character, "neutral");
        if (fs.existsSync(neutralDir)) {
          return this.selectFromDirectory(
            neutralDir,
            character,
            normalizedEmotion,
            chatHistory,
          );
        }

        return {
          success: false,
          error: `No memes found for character: ${character}, emotion: ${emotion}`,
        };
      }

      return this.selectFromDirectory(
        characterDir,
        character,
        normalizedEmotion,
        chatHistory,
      );
    } catch (err) {
      logger.error(`[emoji-agent] Failed to pick emoji: ${err}`);
      return {
        success: false,
        error: String(err),
      };
    }
  }

  private normalizeEmotion(emotion: string): string {
    const normalized = emotion.toLowerCase();
    if (AVAILABLE_EMOTIONS.includes(normalized)) {
      return normalized;
    }
    const mapping: Record<string, string> = {
      开心: "happy",
      难过: "sad",
      生气: "angry",
      惊讶: "surprised",
      困惑: "confused",
      兴奋: "excited",
      疲倦: "tired",
      害羞: "shy",
      骄傲: "proud",
      默认: "default",
      有趣: "funny",
      可爱: "cute",
      爱: "love",
      中性: "neutral",
    };
    return mapping[normalized] || "default";
  }

  private async selectFromDirectory(
    dirPath: string,
    character: string,
    emotion: string,
    chatHistory?: ChatMessage[],
  ): Promise<{
    success: boolean;
    emojiPath?: string;
    description?: string;
    error?: string;
  }> {
    const files = (await fs.promises.readdir(dirPath)).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
    });

    if (files.length === 0) {
      return {
        success: false,
        error: `No emoji files in directory: ${dirPath}`,
      };
    }

    if (files.length === 1 || !chatHistory || chatHistory.length === 0) {
      const emojiPath = path.join(dirPath, files[0]);
      const description = path.basename(files[0], path.extname(files[0]));
      return {
        success: true,
        emojiPath,
        description,
      };
    }

    const model = this.config.workingModel || this.config.model;

    const systemPrompt = `You are an emoji/sticker selection assistant. Your task is to select the most appropriate emoji/sticker from a given list based on the chat context.

Instructions:
1. Analyze the chat history provided
2. Select the emoji that best matches the current conversation mood and context
3. Consider the character's personality and the emotional tone of the conversation
4. Provide your selection in JSON format

Available emojis in directory (${character}/${emotion}):
${files.map((f, i) => `${i + 1}. ${path.basename(f, path.extname(f))}`).join("\n")}

Response format (JSON):
{
  "selectedIndex": number (1-based index from the list above),
  "reason": "brief reason why this emoji is suitable"
}`;

    const historyText = chatHistory
      .slice(-10)
      .map((msg) => {
        const role = msg.role === "assistant" ? "Bot" : msg.userName || "User";
        return `${role}: ${msg.content}`;
      })
      .join("\n");

    const userPrompt = `Chat history:
${historyText}

Select the most appropriate emoji for this conversation. The emoji should match the emotional context and be appropriate for character "${character}" with emotion "${emotion}".`;

    try {
      const response = await this.ai.complete({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      });

      if (!response.content) {
        return this.randomPick(files, dirPath);
      }

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.randomPick(files, dirPath);
      }

      const result = JSON.parse(jsonMatch[0]);
      const selectedIndex = result.selectedIndex;

      if (
        typeof selectedIndex !== "number" ||
        selectedIndex < 1 ||
        selectedIndex > files.length
      ) {
        return this.randomPick(files, dirPath);
      }

      const selectedFile = files[selectedIndex - 1];
      const emojiPath = path.join(dirPath, selectedFile);
      const description = path.basename(
        selectedFile,
        path.extname(selectedFile),
      );

      logger.info(
        `[emoji-agent] Selected: ${selectedFile} (index: ${selectedIndex}, reason: ${result.reason})`,
      );

      return {
        success: true,
        emojiPath,
        description,
      };
    } catch (err) {
      logger.warn(`[emoji-agent] AI selection failed, using random: ${err}`);
      return this.randomPick(files, dirPath);
    }
  }

  private randomPick(
    files: string[],
    dirPath: string,
  ): {
    success: boolean;
    emojiPath?: string;
    description?: string;
    error?: string;
  } {
    const selectedFile = files[Math.floor(Math.random() * files.length)];
    const emojiPath = path.join(dirPath, selectedFile);
    const description = path.basename(selectedFile, path.extname(selectedFile));

    return {
      success: true,
      emojiPath,
      description,
    };
  }

  private cleanMemeMarker(text: string): string {
    let cleaned = text.replace(/\[meme:[^\]]+\]/gi, "");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    cleaned = cleaned
      .split("\n")
      .map((line) => line.trim())
      .join("\n");
    cleaned = cleaned.trim();
    return cleaned;
  }
}
