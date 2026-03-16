import process from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

type MiokiNapcat = {
  name?: string;
  protocol?: string;
  host?: string;
  port?: number;
  token?: string;
};

type MiokuConfig = {
  mioki?: {
    owners?: number[];
    admins?: number[];
    napcat?: MiokiNapcat[];
    plugins?: string[];
    [key: string]: any;
  };
  [key: string]: any;
};

type WebUIAuthConfig = {
  token: string;
  createdAt: number;
  expiresAt: number;
};

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

const DEFAULT_LOCAL_CONFIG: MiokuConfig = {
  mioki: {
    owners: [],
    admins: [],
    napcat: [
      {
        protocol: "ws",
        port: 3000,
        host: "localhost",
        token: "",
      },
    ],
    plugins: ["boot", "help", "chat"],
  },
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function ensureLocalConfig(cwd: string): {
  config: MiokuConfig;
  created: boolean;
} {
  const configDir = join(cwd, "config");
  const localConfigPath = join(configDir, "mioku.json");
  mkdirSync(configDir, { recursive: true });

  if (!existsSync(localConfigPath)) {
    writeFileSync(
      localConfigPath,
      `${JSON.stringify(DEFAULT_LOCAL_CONFIG, null, 2)}\n`,
      "utf-8",
    );
    return {
      config: readJsonFile(localConfigPath, DEFAULT_LOCAL_CONFIG),
      created: true,
    };
  }

  return {
    config: readJsonFile(localConfigPath, DEFAULT_LOCAL_CONFIG),
    created: false,
  };
}

function getPrimaryNapcat(config: MiokuConfig): MiokiNapcat {
  if (!config.mioki || typeof config.mioki !== "object") {
    config.mioki = {};
  }
  if (!Array.isArray(config.mioki.napcat)) {
    config.mioki.napcat = [];
  }
  if (!config.mioki.napcat[0]) {
    config.mioki.napcat[0] = {};
  }
  return config.mioki.napcat[0];
}

function isValidPort(input: number): boolean {
  return Number.isInteger(input) && input > 0 && input <= 65535;
}

function hasNapcatRequiredFields(napcat: MiokiNapcat): boolean {
  const host = String(napcat.host || "").trim();
  const token = String(napcat.token || "").trim();
  const port = Number(napcat.port);
  return Boolean(host) && Boolean(token) && isValidPort(port);
}

function isWebUIInstalled(cwd: string): boolean {
  return existsSync(join(cwd, "src", "services", "webui", "package.json"));
}

function normalizeWebUIAuth(raw: any): WebUIAuthConfig | null {
  const token = String(raw?.token || "").trim();
  const createdAt = Number(raw?.createdAt || 0);
  const expiresAt = Number(raw?.expiresAt || 0);
  if (!token) return null;
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return { token, createdAt, expiresAt };
}

async function askWithDefault(
  ask: (question: string) => Promise<string>,
  label: string,
  defaultValue = "",
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = (await ask(`${label}${suffix}: `)).trim();
  if (!answer && defaultValue) {
    return defaultValue;
  }
  return answer;
}

async function promptForNapcat(
  ask: (question: string) => Promise<string>,
  napcat: MiokiNapcat,
): Promise<void> {
  const currentHost = String(napcat.host || "localhost").trim() || "localhost";
  const currentPort = isValidPort(Number(napcat.port))
    ? String(napcat.port)
    : "3000";
  const currentToken = String(napcat.token || "").trim();

  const host = await askWithDefault(
    ask,
    "请输入NapCat实例正向ws地址",
    currentHost,
  );
  let portText = await askWithDefault(ask, "请输入NapCat实例端口", currentPort);
  while (!isValidPort(Number(portText))) {
    portText = (await ask("端口无效，请输入 1-65535: ")).trim();
  }

  let token = await askWithDefault(ask, "请输入NapCat实例token", currentToken);
  while (!token.trim()) {
    token = (await ask("Napcat token 不能为空，请重新输入: ")).trim();
  }

  napcat.host = host.trim();
  napcat.port = Number(portText);
  napcat.token = token.trim();
  napcat.protocol = String(napcat.protocol || "ws");
}

async function promptForWebUIAuth(
  cwd: string,
  ask: (question: string) => Promise<string>,
): Promise<void> {
  const authPath = join(cwd, "config", "webui", "auth.json");
  const existing = normalizeWebUIAuth(readJsonFile<any>(authPath, null));

  const currentToken = existing?.token || "";
  const raw = await askWithDefault(
    ask,
    "WebUI 自定义密钥（留空自动生成）",
    currentToken,
  );
  const token = raw.trim() || randomBytes(24).toString("hex");

  const now = Date.now();
  const next: WebUIAuthConfig = {
    token,
    createdAt: now,
    expiresAt: now + TEN_YEARS_MS,
  };
  mkdirSync(join(cwd, "config", "webui"), { recursive: true });
  writeFileSync(authPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
}

function hasUsableWebUIAuth(cwd: string): boolean {
  const authPath = join(cwd, "config", "webui", "auth.json");
  const existing = normalizeWebUIAuth(readJsonFile<any>(authPath, null));
  return (
    !!existing && existing.expiresAt > Date.now() && existing.token.length > 0
  );
}

export async function runFirstRunSetup(
  cwd: string = process.cwd(),
): Promise<void> {
  if (process.env.MIOKU_SKIP_SETUP === "1") {
    return;
  }

  const localConfigPath = join(cwd, "config", "mioku.json");
  const ensured = ensureLocalConfig(cwd);
  const napcat = getPrimaryNapcat(ensured.config);
  const needNapcatPrompt = ensured.created || !hasNapcatRequiredFields(napcat);
  const webuiInstalled = isWebUIInstalled(cwd);
  const needWebUIAuthPrompt =
    webuiInstalled && (ensured.created || !hasUsableWebUIAuth(cwd));
  const needAnyPrompt = needNapcatPrompt || needWebUIAuthPrompt;

  if (!needAnyPrompt) {
    return;
  }

  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isTTY) {
    if (needNapcatPrompt) {
      console.warn(
        "[mioku-setup] 检测到 napcat 必填项未配置，当前为非交互终端，已跳过引导。",
      );
      console.warn(`[mioku-setup] 请手动编辑: ${localConfigPath}`);
    }
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("------ 欢迎使用Mioku ------");
    if (needNapcatPrompt) {
      await promptForNapcat((q) => rl.question(q), napcat);
      writeFileSync(
        localConfigPath,
        `${JSON.stringify(ensured.config, null, 2)}\n`,
        "utf-8",
      );
      console.log(`[mioku-setup] 已写入 napcat 配置: ${localConfigPath}`);
    }

    if (needWebUIAuthPrompt) {
      await promptForWebUIAuth(cwd, (q) => rl.question(q));
      console.log(
        "[mioku-setup] 已更新 WebUI 登录密钥: config/webui/auth.json",
      );
    }
  } finally {
    rl.close();
  }
}
