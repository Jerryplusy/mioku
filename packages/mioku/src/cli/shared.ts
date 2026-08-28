import fs, { readFileSync } from "node:fs";
import path from "node:path";
import consola from "consola";
import dedent from "dedent";
import {
  clearCommandCache,
  commandExists,
  resolveCommand,
  runCommandInherit,
} from "../internal/exec";

export const DEFAULT_PACKAGES = [
  "mioku",
  "mioku-plugin-help",
  "mioku-plugin-chat",
  "mioku-service-config",
  "mioku-service-ai",
  "mioku-service-screenshot",
  "mioku-service-help",
];

export const PLUGIN_PREFIX = "mioku-plugin-";
export const SERVICE_PREFIX = "mioku-service-";

export function run(
  cmd: string,
  args: string[] = [],
  options: { cwd?: string } = {},
): void {
  runCommandInherit(cmd, args, options);
}

export async function rmrf(dir: string, retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err: any) {
      if (i === retries - 1) throw err;
      const code = err?.code;
      if (
        code === "EPERM" ||
        code === "EBUSY" ||
        code === "ENOTEMPTY" ||
        code === "ENOENT"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      } else {
        throw err;
      }
    }
  }
}

export function hasCommand(cmd: string): boolean {
  return commandExists(cmd);
}

function findNpmPath(): string | null {
  const resolved = resolveCommand("npm");
  if (resolved) return resolved;
  if (process.platform !== "win32") return null;

  const fallbacks = [
    path.join(process.env.ProgramFiles || "", "nodejs", "npm.cmd"),
    path.join(process.env["ProgramFiles(x86)"] || "", "nodejs", "npm.cmd"),
    path.join(process.env.APPDATA || "", "npm", "npm.cmd"),
  ];

  return fallbacks.find((candidate) => resolveCommand(candidate)) ?? null;
}

export function ensurePackageManager(): void {
  if (hasCommand("bun")) return;
  console.log("安装 bun...");
  const npmPath = findNpmPath();
  if (!npmPath) {
    consola.error("未找到 npm，请确保 Node.js 已安装并包含 npm");
    process.exit(1);
  }
  run(npmPath, ["install", "-g", "bun"]);
  // bun was just put on PATH; drop the cached miss so the next lookup finds it.
  clearCommandCache();
}

export function getAddCommand(packages: string[]): [string, string[]] {
  return ["bun", ["add", ...packages]];
}

export function normalizePackageName(input: string): string {
  if (input.startsWith(PLUGIN_PREFIX) || input.startsWith(SERVICE_PREFIX)) {
    return input;
  }
  if (input.startsWith("mioku-")) return input;
  return `${PLUGIN_PREFIX}${input}`;
}

export function detectType(name: string): "plugin" | "service" | "unknown" {
  if (name.startsWith(PLUGIN_PREFIX)) return "plugin";
  if (name.startsWith(SERVICE_PREFIX)) return "service";
  return "unknown";
}

export function execAdd(packages: string[], cwd?: string): void {
  const [cmd, args] = getAddCommand(packages);
  console.log(`执行: ${cmd} ${args.join(" ")}`);
  run(cmd, args, { cwd });
}

export function appendToMiokuPlugins(cwd: string, pkgName: string): boolean {
  if (!pkgName.startsWith(PLUGIN_PREFIX)) return false;
  const shortName = pkgName.slice(PLUGIN_PREFIX.length);

  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) return false;

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const mioku = pkg.mioku ?? {};
  const plugins = Array.isArray(mioku.plugins) ? [...mioku.plugins] : [];
  if (plugins.includes(shortName)) return false;

  plugins.push(shortName);
  pkg.mioku = { ...mioku, plugins };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

export async function getInstalledPackages(cwd: string): Promise<string[]> {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.keys(deps).filter((k) => k.startsWith("mioku-"));
  } catch {
    return [];
  }
}

export function withRoot(p: string): string {
  return path.resolve(process.cwd(), p);
}

const NPM_REGISTRY = "https://registry.npmjs.org";

export async function fetchNpmKeywords(
  packageName: string,
): Promise<string[] | null> {
  try {
    const res = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(packageName)}`, {
      headers: { Accept: "application/json", "User-Agent": "mioku-cli" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const latestVersion = String(data?.["dist-tags"]?.latest || "").trim();
    const keywords = latestVersion
      ? data?.versions?.[latestVersion]?.keywords
      : data?.keywords;
    return Array.isArray(keywords) ? keywords.map(String) : [];
  } catch {
    return null;
  }
}

export function gracefullyExit(): void {
  console.log("Bye!");
  process.exit(0);
}

export function makeFileTree(
  fileTree: Record<string, string | Record<string, unknown>>,
  base: string,
): void {
  for (const [name, content] of Object.entries(fileTree)) {
    if (typeof content === "object" && content !== null) {
      const subPath = `${base}/${name}`;
      if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
      for (const [subName, subContent] of Object.entries(content)) {
        if (typeof subContent === "object") {
          makeFileTree(
            subContent as Record<string, string | Record<string, unknown>>,
            path.join(subPath, subName),
          );
        } else {
          fs.writeFileSync(`${subPath}/${subName}`, subContent as string);
        }
      }
    } else {
      const filePath = `${base}/${name}`;
      const dirname = path.dirname(filePath);
      if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
      fs.writeFileSync(filePath, content as string);
    }
  }
}

export function buildHelpInfo(version: string): string {
  return dedent(`
  mioku 命令行工具 v${version}

  用法: mioku <命令> [选项]

  命令:
    install plugin <名称>   安装插件，自动补全 mioku-plugin- 前缀
    install service <名称>  安装服务，自动补全 mioku-service- 前缀
    update [包名|self|all]   更新插件或服务
                            update          - 检查可用更新
                            update all      - 更新所有 mioku- 包
                            update self     - 更新 mioku 框架
                            update xxx      - 更新指定包

  选项:
    -h, --help              显示帮助信息
    -v, --version           显示版本号
    --name <name>           指定项目/文件夹名称，默认 mioku-bot
    --protocol <protocol>   指定 NapCat 协议，默认 ws
    --host <host>           指定 NapCat 主机，默认 localhost
    --port <port>           指定 NapCat 端口，默认 3001
    --token <token>         指定 NapCat 连接 Token，默认空
    --prefix <prefix>       指定命令前缀，默认 #
    --owners <owners>       指定主人 QQ，英文逗号分隔，必填
    --admins <admins>       指定管理员 QQ，英文逗号分隔，可空
    --use-npm-mirror        使用 npm 镜像源加速依赖安装，默认否
  `);
}

type OmitTypeWithRequired<T> = Omit<T, "type" | "required"> & {
  required?: boolean;
};

export async function confirm(
  message: string,
  options?: OmitTypeWithRequired<{ initial?: boolean }>,
): Promise<boolean> {
  return consola.prompt(message, {
    type: "confirm",
    cancel: "reject",
    ...options,
  });
}

export async function input(
  message: string,
  options?: OmitTypeWithRequired<{ default?: string; placeholder?: string }>,
): Promise<string> {
  const result = await consola.prompt(message, {
    type: "text",
    cancel: "reject",
    ...options,
  });
  if (options?.required && !result) return input(message, options);
  return result;
}
