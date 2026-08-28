import fs from "node:fs";
import dedent from "dedent";
import {
  DEFAULT_PACKAGES,
  ensurePackageManager,
  getAddCommand,
  run,
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
  installWebui = false,
): Promise<void> {
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

  const packages = installWebui
    ? [...DEFAULT_PACKAGES, "mioku-service-webui"]
    : DEFAULT_PACKAGES;
  const [cmd, args] = getAddCommand(packages);
  console.log(`正在安装 Mioku 依赖: ${cmd} ${args.join(" ")}`);
  run(cmd, args, { cwd: projectPath });
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
  const host = await input("请输入 NapCat WS 主机", {
    default: "localhost",
    placeholder: "localhost",
    required: true,
  });
  const port = parseInt(
    await input("请输入 NapCat WS 端口", {
      default: "3001",
      placeholder: "3001",
      required: true,
    }),
    10,
  );
  const token = await input("请输入 NapCat WS Token（如无则留空）", {
    placeholder: "请输入",
  });

  ensurePackageManager();

  const ownersList = String(owners)
    .split(",")
    .map((o) => o.trim())
    .join(", ");

  const pkgJson = dedent(`
    {
      "name": "${name}",
      "private": true,
      "type": "module",
      "dependencies": {},
      "mioku": {
        "prefix": "#",
        "owners": [${ownersList}],
        "admins": [],
        "plugins": ["boot", "help", "chat", "demo"],
        "log_level": "info",
        "online_push": false,
        "error_push": false,
        "napcat": [
          {
            "protocol": "ws",
            "port": ${port},
            "host": "${host}",
            "token": "${token}"
          }
        ]
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

  const installWebui = await confirm("是否安装 WebUI 管理面板？（建议安装）", {
    initial: true,
  });

  await createNewProject(name, fileTree, installWebui);

  console.log("\n若需启动机器人，请运行：");
  console.log("  cd", name);
  console.log("  bun run start");
  return 0;
}
