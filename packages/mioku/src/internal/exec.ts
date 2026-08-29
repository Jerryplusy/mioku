import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const isWindows = process.platform === "win32";

const resolveCache = new Map<string, string | null>();

function windowsExtensions(): string[] {
  const raw = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  return raw
    .split(");")
    .map((ext) => ext.trim())
    .filter(Boolean);
}

// PATH is a snapshot taken at process start, so a package manager installed
// mid-run won't be on it. These are the standard install prefixes for bun and
// for npm's global bin, which is where `npm i -g bun` actually lands.
function searchDirs(): string[] {
  const raw = process.env.PATH || process.env.Path || "";
  const dirs = raw.split(path.delimiter).map((d) => d.trim()).filter(Boolean);
  const home = os.homedir();

  const extra = isWindows
    ? [
        path.join(home, ".bun", "bin"),
        path.join(process.env.APPDATA || "", "npm"),
        path.join(process.env.ProgramFiles || "", "nodejs"),
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

export function resolveCommand(command: string): string | null {
  if (resolveCache.has(command)) return resolveCache.get(command) ?? null;

  let resolved: string | null = null;

  if (command.includes("/") || command.includes(path.sep)) {
    resolved = isExecutableFile(command) ? path.resolve(command) : null;
  } else {
    const exts = isWindows ? windowsExtensions() : [""];
    const hasKnownExt =
      isWindows && exts.some((ext) => command.toLowerCase().endsWith(ext.toLowerCase()));

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

// cmd.exe argument quoting: escape embedded quotes and any run of backslashes
// that precedes a quote, then wrap the whole thing so metacharacters inside
// (&, |, <, >, ^) are inert.
function quoteForCmd(arg: string): string {
  if (arg === "") return '""';
  const escaped = arg
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

export interface SpawnPlan {
  file: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

// Windows can't CreateProcess a .cmd/.bat shim directly (npm installs bun as
// bun.cmd), so those get routed through cmd.exe with hand-quoted arguments
// rather than shell: true, which would leave the args unquoted.
export function buildSpawnPlan(command: string, args: string[]): SpawnPlan {
  const resolved = resolveCommand(command);

  if (!resolved) {
    return { file: command, args };
  }

  if (!needsCmdShell(resolved)) {
    return { file: resolved, args };
  }

  const comspec = process.env.ComSpec || process.env.COMSPEC || "cmd.exe";
  const line = [resolved, ...args].map(quoteForCmd).join(" ");
  return {
    file: comspec,
    args: ["/d", "/s", "/c", `"${line}"`],
    windowsVerbatimArguments: true,
  };
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

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
      windowsVerbatimArguments: plan.windowsVerbatimArguments,
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

export function runCommandInherit(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): void {
  const plan = buildSpawnPlan(command, args);
  const result = spawnSync(plan.file, plan.args, {
    cwd: options.cwd,
    stdio: "inherit",
    windowsVerbatimArguments: plan.windowsVerbatimArguments,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} 退出码 ${result.status}`);
  }
}

export function commandExists(command: string): boolean {
  return resolveCommand(command) !== null;
}
