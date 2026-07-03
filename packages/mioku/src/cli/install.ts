import consola from "consola";
import {
  ensurePackageManager,
  appendToMiokiPlugins,
  execAdd,
  PLUGIN_PREFIX,
  SERVICE_PREFIX,
} from "./shared";

export async function installCommand(
  cmdArgs: string[],
  helpInfo: string,
): Promise<number> {
  ensurePackageManager();
  const cwd = process.cwd();
  const [type, name] = cmdArgs;

  if (!type || !name) {
    consola.error(
      "请指定类型和名称: mioku install plugin <名称> 或 mioku install service <名称>",
    );
    console.log(helpInfo);
    return 1;
  }

  if (type !== "plugin" && type !== "service") {
    consola.error(`无效的类型 "${type}"，请使用 plugin 或 service`);
    console.log(helpInfo);
    return 1;
  }

  const prefix = type === "plugin" ? PLUGIN_PREFIX : SERVICE_PREFIX;
  const normalized = `${prefix}${name}`;

  try {
    execAdd([normalized], cwd);
    consola.success(`已安装 ${normalized}`);

    if (type === "plugin") {
      const shortName = normalized.slice(PLUGIN_PREFIX.length);
      if (appendToMiokiPlugins(cwd, normalized)) {
        consola.success(`已在 mioki.plugins 中启用 ${shortName}`);
      } else {
        consola.info(`${shortName} 已在 mioki.plugins 中，跳过`);
      }
    }
    return 0;
  } catch {
    consola.error(`安装失败: ${normalized}`);
    return 1;
  }
}
