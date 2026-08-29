import type {
  AdapterBotBase,
  BotBase,
  MessageInput,
  MessageSegment,
  MessageTarget,
  SentMessage,
} from "mioku";
import { segment } from "mioku";

export interface StdinData {
  bot_id: string;
  adapter: "stdin";
  nickname: string;
  online: boolean;
  connected_at?: number;
}

export type StdinBot = BotBase & {
  readonly adapter: "stdin";
  sendMessage(
    target: MessageTarget,
    message: MessageInput,
  ): Promise<SentMessage>;
  sendApi<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
};

export type StdinBotBase = AdapterBotBase<StdinBot>;

declare module "mioku" {
  interface AdapterBotMap {
    stdin: StdinBot;
  }
}

const SEGMENT_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  record: "语音",
  file: "文件",
  face: "表情",
  dice: "骰子",
  rps: "猜拳",
  at: "AT",
  reply: "引用",
  forward: "合并转发",
  node: "消息节点",
  json: "JSON卡片",
  markdown: "Markdown",
  music: "音乐",
  contact: "推荐",
  location: "位置",
  share: "分享",
  poke: "戳一戳",
};

const labelOf = (type: string): string => SEGMENT_LABELS[type] ?? type;

const readFileRef = (
  seg: MessageSegment,
): { kind: "path" | "base64" | "unknown"; value: string } | null => {
  const data = seg.data;
  const candidates = [
    data.url,
    data.file,
    data.path,
    seg.attachment?.url,
    seg.attachment?.file,
  ];
  const found = candidates.find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (found == null) return null;
  if (found.startsWith("base64://"))
    return { kind: "base64", value: found.slice("base64://".length) };
  if (found.startsWith("file:///"))
    return { kind: "path", value: found.replace(/^file:\/\/\//, "") };
  return { kind: "path", value: found };
};

export const renderSegment = (seg: MessageSegment): string => {
  if (seg.type === "text") return String(seg.data.text ?? "");
  const label = labelOf(seg.type);
  const ref = readFileRef(seg);
  if (ref) {
    if (ref.kind === "base64") {
      const name =
        typeof seg.data.name === "string" ? seg.data.name : undefined;
      const bytes = Math.floor((ref.value.length * 3) / 4);
      return `[${label}: base64数据${name ? `(${name})` : ""} ${bytes}字节]`;
    }
    return `[${label}: ${ref.value}]`;
  }
  if (seg.type === "at") {
    const raw = seg.data.target ?? seg.data.qq;
    return `[@${raw == null ? "?" : String(raw)}]`;
  }
  const keys = Object.keys(seg.data);
  if (keys.length === 0) return `[${label}]`;
  return `[${label}: ${JSON.stringify(seg.data)}]`;
};

export const renderMessage = (message: MessageInput): string => {
  const input = message as MessageInput;
  let segments: readonly MessageSegment[];
  if (typeof input === "string") {
    segments = [segment.text(input)];
  } else if (Array.isArray(input)) {
    segments = input.map((item) =>
      typeof item === "string" ? segment.text(item) : item,
    );
  } else {
    segments = [input as MessageSegment];
  }
  return segments
    .map((seg) => renderSegment(seg))
    .filter((line) => line.length > 0)
    .join("");
};

let sendSeq = 0;
const nextMessageId = (): string => `stdin:${++sendSeq}:${Date.now()}`;

export const createStdinBot = (
  data: StdinData,
  onSend?: () => void,
): StdinBotBase => {
  const bot = {
    get bot_id() {
      return data.bot_id;
    },
    adapter: data.adapter,
    get nickname() {
      return data.nickname;
    },
    get online() {
      return data.online;
    },
    get connected_at() {
      return data.connected_at;
    },
    async sendMessage(
      _target: MessageTarget,
      message: MessageInput,
    ): Promise<SentMessage> {
      const text = renderMessage(message);
      if (text) console.log(text);
      onSend?.();
      return { message_id: nextMessageId(), sent_at: Date.now() };
    },
    async sendApi<T = unknown>(
      _action: string,
      _params?: Record<string, unknown>,
    ): Promise<T> {
      throw new Error("stdin adapter does not support arbitrary platform APIs");
    },
    as<T extends object = Record<string, unknown>>() {
      return this as unknown as T;
    },
  } satisfies StdinBotBase;
  return bot;
};
