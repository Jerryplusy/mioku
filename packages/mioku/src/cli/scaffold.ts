import fs from "node:fs";
import path from "node:path";
import dedent from "dedent";
import consola from "consola";
import {
  ADAPTER_PREFIX,
  PLUGIN_PREFIX,
  SERVICE_PREFIX,
  ensurePackageManager,
  getAddCommand,
  multiSelect,
  run,
  runAdapterCli,
  searchMiokuPackages,
  shortNameOfPackage,
  rmrf,
  withRoot,
  gracefullyExit,
  makeFileTree,
  input,
  confirm,
} from "./shared";

async function createNewProject(
  name: string,
  fileTree: Record<string, string | Record<string, unknown>>,
): Promise<string> {
  const projectPath = withRoot(`./${name}`);

  if (fs.existsSync(projectPath)) {
    const overwrite = await confirm(`项目 ${name} 已存在，是否覆盖？`);
    if (!overwrite) gracefullyExit();

    if (projectPath === process.cwd()) {
      if (fs.readdirSync(projectPath).length !== 0) {
        const confirmOver = await confirm(
          "项目路径与当前路径相同，将删除当前目录下所有内容再创建，是否继续？",
        );
        if (!confirmOver) gracefullyExit();
      }
    }
    await rmrf(projectPath);
  }

  fs.mkdirSync(projectPath, { recursive: true });
  makeFileTree(fileTree, projectPath);
  console.log(`项目 ${name} 创建成功！`);

  console.log("正在安装基础依赖 (bun i) ...");
  run("bun", ["i"], { cwd: projectPath });
  return projectPath;
}

async function selectPackages(
  message: string,
  prefix: string,
  initial: string[] = [],
): Promise<string[]> {
  console.log(`\n正在从 npm 拉取 ${prefix}* 包...`);
  const hits = await searchMiokuPackages(prefix);
  if (hits.length === 0) {
    consola.warn(`未在 npm 上找到任何 ${prefix}* 包`);
    return [];
  }
  const items = hits.map((hit) => ({
    label: `${hit.name}  (${hit.description || "暂无介绍"})`,
    value: hit.name,
  }));
  return multiSelect(message, items, initial);
}

export async function scaffoldCommand(version: string): Promise<number> {
  const name = await input("请输入项目名称", {
    default: "mioku-bot",
    placeholder: "mioku-bot",
    required: true,
  });
  const owners = await input("请输入主人 QQ (最高权限，英文逗号分隔，必填)", {
    placeholder: "请输入",
    default: "",
    required: true,
  });

  ensurePackageManager();

  const ownersList = String(owners)
    .split(",")
    .map((o) => o.trim())
    .join(", ");

  const adapterNames = await selectPackages(
    "选择要安装的适配器（上下键选择，空格勾选，回车确认）",
    ADAPTER_PREFIX,
  );
  if (adapterNames.length === 0) {
    consola.warn("未选择任何适配器，将创建无适配器的零配置项目");
  }

  const pkgJson = dedent(`
    {
      "name": "${name}",
      "private": true,
      "type": "module",
      "dependencies": {
        "mioku": "latest"
        ${adapterNames.map((pkg) => `,\n        "${pkg}": "latest"`).join("")}
      },
      "mioku": {
        "prefix": ".",
        "owners": [${ownersList}],
        "admins": [],
        "plugins": ["demo"],
        "log_level": "info",
        "online_push": false,
        "error_push": false
      },
      "scripts": {
        "start": "bun run app.ts",
        "dev": "bun run --watch app.ts"
      }
    }
  `);

  const pluginCode = dedent(`
    import { definePlugin } from 'mioku'

    export default definePlugin({
      name: 'demo',
      version: '${version}',
      async setup(ctx) {
        ctx.logger.info('Demo 插件已加载')

        ctx.handle('message', async (e) => {
          if (e.raw_message === 'hello') {
            e.reply('world', true)
          }
        })

        return () => {
          ctx.logger.info('Demo 插件已卸载')
        }
      },
    })
  `);

  const fileTree: Record<string, string | Record<string, unknown>> = {
    "app.ts":
      "import { start } from 'mioku'\n\nstart({ cwd: import.meta.dirname }).then()\n",
    "package.json": pkgJson,
    plugins: { demo: { "index.ts": pluginCode } },
    config: {},
    data: {},
  };

  const projectPath = await createNewProject(name, fileTree);

  for (const adapterPkg of adapterNames) {
    const adapterName = shortNameOfPackage(adapterPkg);
    consola.info(`正在运行 ${adapterPkg} 配置向导...`);
    runAdapterCli(adapterName, projectPath);
  }

  const pluginNames = await selectPackages(
    "选择要安装的插件（上下键选择，空格勾选，回车确认）",
    PLUGIN_PREFIX,
    ["mioku-plugin-help", "mioku-plugin-chat"],
  );
  const serviceNames = await selectPackages(
    "选择要安装的服务（上下键选择，空格勾选，回车确认）",
    SERVICE_PREFIX,
  );

  const enabledPlugins = ["demo", ...pluginNames.map(shortNameOfPackage)];
  const pkgPath = path.join(projectPath, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.mioku = { ...pkg.mioku, plugins: enabledPlugins };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const installWebui = await confirm("是否安装 WebUI 管理面板？（建议安装）", {
    initial: true,
  });

  const addPackages = [...pluginNames, ...serviceNames];
  if (installWebui) addPackages.push("mioku-service-webui");

  if (addPackages.length > 0) {
    const [cmd, args] = getAddCommand(addPackages);
    console.log(`正在安装插件与服务: ${cmd} ${args.join(" ")}`);
    run(cmd, args, { cwd: projectPath });
  }

  console.log("\n若需启动机器人，请运行：");
  console.log("  cd", name);
  console.log("  bun run start");
  return 0;
}
