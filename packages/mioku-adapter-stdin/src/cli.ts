#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import consola from "consola";

export const run = async (ctx: {
  cwd: string;
}): Promise<Record<string, unknown>> => {
  const pkgPath = path.join(ctx.cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    consola.error("未找到 package.json，请在机器人项目根目录运行此向导");
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
    mioku?: Record<string, unknown>;
  };
  pkg.mioku = pkg.mioku ?? {};
  const adapters =
    (pkg.mioku.adapters as Record<string, unknown> | undefined) ?? {};
  pkg.mioku.adapters = {
    ...adapters,
    stdin: (adapters.stdin as Record<string, unknown> | undefined) ?? {},
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
  consola.success(
    "stdin 适配器为免配置适配器，已确保 mioku.adapters.stdin 生效",
  );
  return {};
};

const isRunningAsMain = (): boolean => {
  if (!process.argv[1]) return false;
  try {
    return (
      import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
    );
  } catch {
    return false;
  }
};

if (isRunningAsMain()) {
  void (async () => {
    await run({ cwd: process.cwd() });
  })();
}

export default run;
