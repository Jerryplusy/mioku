import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { mkdirSync } from "node:fs";

function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as any;
    }
  }

  return result;
}

let originalPackageJson: string | null = null;

const defaultPackageJSon = {
  mioki: {
    owners: [],
    admins: [],
    napcat: [
      {
        name: "miku",
        protocol: "ws",
        port: 3000,
        host: "localhost",
        token: "",
      },
    ],
    plugins: ["boot"],
  },
};

export function loadLocalConfig(cwd: string = process.cwd()): void {
  const packageJsonPath = join(cwd, "package.json");
  const localConfigPath = join(cwd, "config/mioku.json");

  // 检查本地配置文件是否存在
  if (!existsSync(localConfigPath)) {
    writeFileSync(
      localConfigPath,
      JSON.stringify(defaultPackageJSon, null, 2),
      "utf-8",
    );
  }

  try {
    // 读取并备份原始 package.json
    originalPackageJson = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(originalPackageJson);

    // 读取本地配置
    const localConfig = JSON.parse(readFileSync(localConfigPath, "utf-8"));

    if (localConfig.mioki && packageJson.mioki) {
      packageJson.mioki = deepMerge(packageJson.mioki, localConfig.mioki);

      writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2),
        "utf-8",
      );

      const restoreConfig = () => {
        if (originalPackageJson) {
          writeFileSync(packageJsonPath, originalPackageJson, "utf-8");
        }
      };

      process.on("exit", restoreConfig);
      process.on("SIGINT", () => {
        restoreConfig();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        restoreConfig();
        process.exit(0);
      });
      process.on("uncaughtException", (error) => {
        restoreConfig();
        console.error(error);
        process.exit(1);
      });
    }
  } catch (error) {
    throw error;
  }
}
