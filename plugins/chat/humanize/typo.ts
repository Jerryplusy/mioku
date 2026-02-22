import type { ChatConfig } from "../types";

const HOMOPHONE_MAP: Record<string, string[]> = {
  的: ["得", "地"],
  得: ["的", "地"],
  地: ["的", "得"],
  在: ["再"],
  再: ["在"],
  做: ["作"],
  作: ["做"],
  那: ["哪"],
  哪: ["那"],
  他: ["她", "它"],
  她: ["他"],
  以: ["已"],
  已: ["以"],
  像: ["象", "想"],
  想: ["象", "像"],
  带: ["代", "待"],
  代: ["带", "待"],
  待: ["带", "代"],
  座: ["坐"],
  坐: ["座"],
  和: ["合"],
  合: ["和"],
  会: ["回", "汇"],
  回: ["会"],
  到: ["道"],
  道: ["到"],
  是: ["事", "试"],
  事: ["是", "试"],
  看: ["砍"],
  吗: ["嘛", "马"],
  嘛: ["吗", "马"],
  了: ["啦"],
  啦: ["了"],
  呢: ["尼", "泥"],
  吧: ["把", "爸"],
  把: ["吧"],
  就: ["旧"],
  还: ["换"],
  很: ["狠"],
  真: ["针", "珍"],
  知: ["只", "之"],
  只: ["知", "之"],
  之: ["知", "只"],
  说: ["谁"],
  什: ["身"],
  么: ["没"],
  没: ["么"],
  要: ["药", "耀"],
  好: ["号"],
  对: ["队"],
  不: ["步", "部"],
  这: ["着"],
  着: ["这"],
  有: ["又", "右"],
  又: ["有", "右"],
  人: ["仁", "任"],
  大: ["达"],
  上: ["尚", "伤"],
  下: ["吓", "夏"],
  中: ["钟", "终"],
  来: ["赖"],
  去: ["趣"],
  出: ["初", "除"],
  时: ["实", "食"],
  实: ["时", "食"],
  年: ["念"],
  生: ["声", "升"],
  能: ["嫩"],
  过: ["锅"],
  也: ["夜", "业"],
  可: ["课", "克"],
  多: ["夺"],
  后: ["候", "厚"],
  候: ["后"],
  前: ["钱", "浅"],
  钱: ["前"],
  里: ["理", "力"],
  理: ["里"],
  心: ["新", "信", "辛"],
  新: ["心", "信"],
  信: ["心", "新"],
  长: ["常", "场"],
  常: ["长"],
  开: ["凯"],
  关: ["官", "观"],
  问: ["文", "闻"],
  文: ["问", "闻"],
  话: ["画", "化"],
  画: ["话"],
  意: ["义", "议", "忆"],
  义: ["意", "议"],
  感: ["赶", "敢"],
  觉: ["角", "脚"],
  情: ["请", "清", "晴"],
  请: ["情", "清"],
  清: ["情", "请"],
  明: ["名", "命"],
  名: ["明"],
  气: ["器", "起"],
  起: ["气", "器"],
  点: ["店", "电"],
  电: ["点", "店"],
  面: ["免", "棉"],
  手: ["受", "收"],
  头: ["投", "偷"],
  身: ["深", "神"],
  走: ["奏"],
  跑: ["泡", "炮"],
  吃: ["迟", "池"],
  喝: ["河", "何"],
  睡: ["水", "谁"],
  玩: ["完", "晚"],
  完: ["玩", "晚"],
  晚: ["玩", "完"],
  早: ["找", "造"],
  找: ["早"],
  快: ["块", "筷"],
  慢: ["满", "蛮"],
  高: ["搞", "告"],
  低: ["底", "地"],
  远: ["院", "愿"],
  近: ["进", "尽"],
  进: ["近", "尽"],
};

const CASUAL_REPLACEMENTS: [RegExp, string[]][] = [
  [/不知道/, ["不造", "不晓"]],
  [/什么/, ["啥", "什莫"]],
  [/为什么/, ["为啥", "咋"]],
  [/怎么/, ["咋", "怎莫"]],
  [/这样/, ["酱", "这样子"]],
  [/那样/, ["那样子"]],
  [/非常/, ["超", "贼"]],
  [/特别/, ["超", "贼"]],
  [/可以/, ["行", "ok", "可"]],
  [/没有/, ["没", "木有"]],
  [/不是/, ["不似"]],
  [/觉得/, ["感觉", "jio得"]],
  [/知道/, ["晓得的", "知到"]],
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
