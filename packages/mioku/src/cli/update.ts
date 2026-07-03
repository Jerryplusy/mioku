import consola from "consola";
import {
  run,
  ensurePackageManager,
  getInstalledPackages,
  PLUGIN_PREFIX,
  SERVICE_PREFIX,
} from "./shared";

async function updatePackages(packages: string[], cwd: string): Promise<void> {
  if (packages.length === 0) {
    consola.info("未找到 mioku- 相关依赖");
    return;
  }
  console.log(`执行: bun update ${packages.join(" ")} --latest`);
  run("bun", ["update", ...packages, "--latest"], { cwd });
}

async function updateByPrefix(
  prefix: string,
  cwd: string,
  name?: string,
): Promise<void> {
  if (name) {
    const normalized = name.startsWith(prefix) ? name : `${prefix}${name}`;
    console.log(`执行: bun update ${normalized} --latest`);
    run("bun", ["update", normalized, "--latest"], { cwd });
    return;
  }
  const packages = (await getInstalledPackages(cwd)).filter((p) =>
    p.startsWith(prefix),
  );
  if (packages.length === 0) {
    consola.info(`未找到 ${prefix}* 相关依赖`);
    return;
  }
  await updatePackages(packages, cwd);
}

export async function updateCommand(cmdArgs: string[]): Promise<number> {
  ensurePackageManager();
  const cwd = process.cwd();
  const [target, name] = cmdArgs;

  if (!target || target === "check") {
    run("bun", ["update", "-i"], { cwd });
    return 0;
  }

  if (target === "all") {
    await updatePackages(await getInstalledPackages(cwd), cwd);
    return 0;
  }

  if (target === "self") {
    console.log("执行: bun update mioku --latest");
    run("bun", ["update", "mioku", "--latest"], { cwd });
    return 0;
  }

  if (target === "plugin" || target === "service") {
    const prefix = target === "plugin" ? PLUGIN_PREFIX : SERVICE_PREFIX;
    await updateByPrefix(prefix, cwd, name);
    return 0;
  }

  console.log(`执行: bun update ${target} --latest`);
  run("bun", ["update", target, "--latest"], { cwd });
  return 0;
}
