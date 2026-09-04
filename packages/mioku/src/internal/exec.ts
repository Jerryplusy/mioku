import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const isWindows = process.platform === "win32";

const resolveCache = new Map<string, string | null>();

function windowsExtensions(): string[] {
  const raw = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  return raw
    .split(";")
    .map((ext) => ext.trim())
    .filter(Boolean);
}

// PATH is a snapshot taken at process start, so a package manager installed
// mid-run won't be on it. We enumerate every plausible install prefix for
// bun / npm / scoop / chocolatey so the CLI can find bun in one shot.
function searchDirs(): string[] {
  const raw = process.env.PATH || process.env.Path || "";
  const dirs = raw
    .split(path.delimiter)
    .map((d) => d.trim())
    .filter(Boolean);
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData =
    process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const extra = isWindows
    ? [
        // 官方安装器
        path.join(home, ".bun", "bin"),
        // npm 全局（带 .cmd shim）
        path.join(appData, "npm"),
        path.join(appData, "npm", "node_modules", ".bin"),
        // 备用 bun 位置
        path.join(localAppData, "bun", "bin"),
        path.join(programFiles, "bun", "bin"),
        path.join(programFilesX86, "bun", "bin"),
        // scoop
        path.join(home, "scoop", "shims"),
        // chocolatey
        "C:\\ProgramData\\chocolatey\\bin",
        // node 自带（很多用户 npm i -g 装到 node 目录）
        path.join(programFiles, "nodejs"),
        path.join(programFilesX86, "nodejs"),
      ]
    : [
        path.join(home, ".bun", "bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
        path.join(home, ".npm-global", "bin"),
      ];

  return [...dirs, ...extra.filter((dir) => dir && !dir.endsWith(path.sep))];
}

function isExecutableFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function searchCommandViaShell(command: string): string | null {
  if (command.includes("/") || command.includes(path.sep)) return null;
  const shellCmd = isWindows ? "where" : "which";
  try {
    const result = spawnSync(shellCmd, [command], {
      encoding: "utf-8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      const first = result.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (first && isExecutableFile(first)) return first;
    }
  } catch {}
  return null;
}

/** 在 PATH 及常见安装目录中解析命令的完整路径，结果带缓存 */
export function resolveCommand(command: string): string | null {
  if (resolveCache.has(command)) return resolveCache.get(command) ?? null;

  let resolved: string | null = null;

  if (command.includes("/") || command.includes(path.sep)) {
    resolved = isExecutableFile(command) ? path.resolve(command) : null;
  } else {
    const exts = isWindows ? windowsExtensions() : [""];
    const hasKnownExt =
      isWindows &&
      exts.some((ext) => command.toLowerCase().endsWith(ext.toLowerCase()));

    outer: for (const dir of searchDirs()) {
      if (hasKnownExt) {
        const direct = path.join(dir, command);
        if (isExecutableFile(direct)) {
          resolved = direct;
          break;
        }
        continue;
      }
      for (const ext of exts) {
        const candidate = path.join(dir, command + ext);
        if (isExecutableFile(candidate)) {
          resolved = candidate;
          break outer;
        }
      }
    }

    if (!resolved) resolved = searchCommandViaShell(command);
  }

  resolveCache.set(command, resolved);
  return resolved;
}

export function clearCommandCache(): void {
  resolveCache.clear();
}

function needsCmdShell(resolved: string): boolean {
  if (!isWindows) return false;
  const ext = path.extname(resolved).toLowerCase();
  return ext === ".cmd" || ext === ".bat";
}

export interface SpawnPlan {
  file: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
  shell?: boolean | string;
}

// Windows can't CreateProcess a .cmd/.bat shim directly (npm installs bun as
// bun.cmd), so those get routed through cmd.exe via shell: true. Previously
// we hand-rolled a cmd.exe invocation with windowsVerbatimArguments: true,
// but that combination misbehaves with spawnSync + stdio:"inherit" on
// Node.js >= 20 (manifests as the spawned process printing "undefined" or
// a spurious EINVAL), so we let Node's shell wrapper do the quoting.
/** 生成跨平台的 spawn 参数，Windows 下 .cmd/.bat 会改经 cmd.exe 执行 */
export function buildSpawnPlan(command: string, args: string[]): SpawnPlan {
  const resolved = resolveCommand(command);

  if (!resolved) {
    return { file: command, args };
  }

  if (!needsCmdShell(resolved)) {
    return { file: resolved, args };
  }

  return {
    file: resolved,
    args,
    shell: true,
  };
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** 执行命令并收集 stdout/stderr 与退出码，失败不抛异常 */
export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<RunCommandResult> {
  const plan = buildSpawnPlan(command, args);

  return new Promise((resolve) => {
    const child = spawn(plan.file, plan.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: plan.shell,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on("error", (error) => {
      resolve({
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        code: 1,
      });
    });
  });
}

/** 同步执行命令并继承当前终端的输入输出，非零退出码时抛错 */
export function runCommandInherit(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): void {
  const plan = buildSpawnPlan(command, args);
  const result = spawnSync(plan.file, plan.args, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: plan.shell,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} 退出码 ${result.status}`);
  }
}

/** 判断命令是否可用 */
export function commandExists(command: string): boolean {
  return resolveCommand(command) !== null;
}
