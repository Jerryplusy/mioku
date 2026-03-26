import process from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
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

function ensureMiokiRoot(config: MiokuConfig): NonNullable<MiokuConfig["mioki"]> {
  if (!config.mioki || typeof config.mioki !== "object") {
    config.mioki = {};
  }
  if (!Array.isArray(config.mioki.owners)) {
    config.mioki.owners = [];
  }
  if (!Array.isArray(config.mioki.admins)) {
    config.mioki.admins = [];
  }
  if (!Array.isArray(config.mioki.plugins)) {
    config.mioki.plugins = ["boot", "help", "chat"];
  }
  return config.mioki;
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

function isValidQQ(input: string): boolean {
  if (!/^\d{5,15}$/.test(input)) {
    return false;
  }
  const value = Number(input);
  return Number.isSafeInteger(value) && value > 10000;
}

function hasOwnerConfigured(config: MiokuConfig): boolean {
  const owners = config.mioki?.owners;
  if (!Array.isArray(owners) || owners.length === 0) {
    return false;
  }
  return owners.some((item) => Number.isSafeInteger(Number(item)) && Number(item) > 10000);
}

function isWebUIInstalled(cwd: string): boolean {
  return (
    existsSync(join(cwd, "src", "services", "webui", "package.json")) &&
    existsSync(join(cwd, "src", "services", "webui", "dist", "index.html"))
  );
}

function isDockerRuntime(): boolean {
  return process.env.MIOKU_DOCKER === "1" || existsSync("/.dockerenv");
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
  const answer = (await ask(`\n${label}${suffix}\n> `)).trim();
  if (!answer && defaultValue) {
    return defaultValue;
  }
  return answer;
}

async function askYesNo(
  ask: (question: string) => Promise<string>,
  label: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await ask(`\n${label} (${hint})\n> `)).trim().toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  if (["y", "yes"].includes(answer)) {
    return true;
  }
  if (["n", "no"].includes(answer)) {
    return false;
  }
  return defaultYes;
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

async function promptForOwnerQQ(
  ask: (question: string) => Promise<string>,
  config: MiokuConfig,
): Promise<void> {
  const mioki = ensureMiokiRoot(config);
  const currentOwner =
    Array.isArray(mioki.owners) && mioki.owners.length > 0
      ? String(mioki.owners[0])
      : "";

  let ownerQQ = await askWithDefault(ask, "请输入主人QQ", currentOwner);
  while (!isValidQQ(ownerQQ)) {
    ownerQQ = (await ask("\n主人QQ无效，请输入纯数字QQ号（至少5位）\n> ")).trim();
  }

  mioki.owners = [Number(ownerQQ)];
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

async function installWebUI(cwd: string): Promise<boolean> {
  const scriptPath = join(cwd, "install-mioku.sh");
  if (!existsSync(scriptPath)) {
    console.warn("[mioku-setup] 未找到 install-mioku.sh，跳过 WebUI 安装。");
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const child = spawn("bash", [scriptPath, "webui"], {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.on("error", (error) => {
      console.warn(`[mioku-setup] WebUI 安装失败: ${error.message}`);
      resolve(false);
    });

    child.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

export async function runFirstRunSetup(
  cwd: string = process.cwd(),
): Promise<void> {
  if (process.env.MIOKU_SKIP_SETUP === "1") {
    return;
  }

  const localConfigPath = join(cwd, "config", "mioku.json");
  const ensured = ensureLocalConfig(cwd);
  ensureMiokiRoot(ensured.config);
  const napcat = getPrimaryNapcat(ensured.config);
  const needNapcatPrompt = ensured.created || !hasNapcatRequiredFields(napcat);
  const needOwnerPrompt = ensured.created || !hasOwnerConfigured(ensured.config);
  const dockerRuntime = isDockerRuntime();
  let webuiInstalled = isWebUIInstalled(cwd);
  const needWebUIInstallPrompt = ensured.created && !webuiInstalled;
  let needWebUIAuthPrompt =
    webuiInstalled && (ensured.created || !hasUsableWebUIAuth(cwd));
  const needAnyPrompt =
    needNapcatPrompt || needOwnerPrompt || needWebUIInstallPrompt || needWebUIAuthPrompt;

  if (!needAnyPrompt) {
    return;
  }

  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isTTY) {
    if (dockerRuntime && needAnyPrompt) {
      const missingItems: string[] = [];
      if (needWebUIInstallPrompt) {
        missingItems.push("WebUI 安装确认");
      }
      if (needNapcatPrompt) {
        missingItems.push("NapCat 连接配置");
      }
      if (needOwnerPrompt) {
        missingItems.push("主人 QQ");
      }
      if (needWebUIAuthPrompt) {
        missingItems.push("WebUI 登录密钥");
      }
      console.error(
        `[mioku-setup] Docker 首次启动需要交互终端来完成初始化：${missingItems.join("、")}`,
      );
      console.error(
        "[mioku-setup] 请先使用交互模式运行一次，例如 `docker run -it ...` 或 `docker compose run --rm --service-ports mioku`。",
      );
      throw new Error("Docker 初始配置未完成");
    }

    if (needNapcatPrompt) {
      console.warn(
        "[mioku-setup] 检测到 napcat 必填项未配置，当前为非交互终端，已跳过引导。",
      );
      console.warn(`[mioku-setup] 请手动编辑: ${localConfigPath}`);
    }
    if (needWebUIInstallPrompt) {
      console.warn(
        "[mioku-setup] 当前未安装 WebUI，若需要可执行: ./install-mioku.sh webui",
      );
    }
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const ask = (question: string) => rl.question(question);

  try {
    console.log("------ 欢迎使用Mioku ------");
    if (needWebUIInstallPrompt) {
      const shouldInstallWebUI = await askYesNo(
        ask,
        "是否现在安装 WebUI 管理界面",
        true,
      );

      if (shouldInstallWebUI) {
        console.log("[mioku-setup] 正在安装 WebUI，请稍候...");
        const installed = await installWebUI(cwd);
        if (installed) {
          webuiInstalled = isWebUIInstalled(cwd);
          needWebUIAuthPrompt =
            webuiInstalled && (ensured.created || !hasUsableWebUIAuth(cwd));
          console.log("[mioku-setup] WebUI 安装完成。");
        } else {
          console.warn(
            "[mioku-setup] WebUI 安装失败，可稍后手动执行 ./install-mioku.sh webui",
          );
        }
      }
    }

    if (needNapcatPrompt) {
      await promptForNapcat(ask, napcat);
    }

    if (needOwnerPrompt) {
      await promptForOwnerQQ(ask, ensured.config);
    }

    if (needNapcatPrompt || needOwnerPrompt) {
      writeFileSync(localConfigPath, `${JSON.stringify(ensured.config, null, 2)}\n`, "utf-8");
      console.log(`[mioku-setup] 已写入本地配置: ${localConfigPath}`);
    }

    if (needWebUIAuthPrompt) {
      await promptForWebUIAuth(cwd, ask);
      console.log(
        "[mioku-setup] 已更新 WebUI 登录密钥: config/webui/auth.json",
      );
    }
  } finally {
    rl.close();
  }
}
