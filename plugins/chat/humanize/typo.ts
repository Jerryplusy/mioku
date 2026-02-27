import type { ChatConfig } from "../types";

const HOMOPHONE_MAP: Record<string, string[]> = {
  的: ["得", "地"],
  得: ["的", "地"],
  地: ["的", "得"],
  做: ["作"],
  作: ["做"],
  他: ["她", "它"],
  她: ["他"],
  以: ["已"],
  已: ["以"],
  座: ["坐"],
  坐: ["座"],
  和: ["合"],
  合: ["和"],
  吗: ["嘛", "马"],
  嘛: ["吗", "马"],
  呢: ["尼", "泥"],
  把: ["吧"],
};

const CASUAL_REPLACEMENTS: [RegExp, string[]][] = [
  [/不知道/, ["不到"]],
  [/什么/, ["啥", "啥子"]],
  [/为什么/, ["为啥", "咋"]],
  [/怎么/, ["咋", "怎莫"]],
  [/这样/, ["酱", "这样子"]],
  [/非常/, ["超", "贼"]],
  [/特别/, ["超", "贼"]],
  [/没有/, ["没", "木有"]],
  [/不是/, ["不似"]],
  [/觉得/, ["感觉", "jio得"]],
  [/厉害/, ["牛", "nb", "6"]],
];

export class TypoGenerator {
  private config: ChatConfig;

  constructor(config: ChatConfig) {
    this.config = config;
  }

  apply(text: string): string {
    if (!this.config.typo?.enabled) return text;

    const errorRate = this.config.typo.errorRate ?? 0.03;
    const wordReplaceRate = this.config.typo.wordReplaceRate ?? 0.1;

    let result = text;

    if (Math.random() < wordReplaceRate) {
      for (const [pattern, replacements] of CASUAL_REPLACEMENTS) {
        if (pattern.test(result) && Math.random() < wordReplaceRate) {
          const replacement =
            replacements[Math.floor(Math.random() * replacements.length)];
          result = result.replace(pattern, replacement);
          break;
        }
      }
    }

    const chars = [...result];
    for (let i = 0; i < chars.length; i++) {
      if (Math.random() < errorRate) {
        const homophones = HOMOPHONE_MAP[chars[i]];
        if (homophones && homophones.length > 0) {
          chars[i] = homophones[Math.floor(Math.random() * homophones.length)];
        }
      }
    }

    return chars.join("");
  }
}
