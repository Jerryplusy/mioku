import { loadLocalConfig } from "./src/config-loader";
import { runFirstRunSetup } from "./src/first-run-setup";

async function bootstrap() {
  const cwd = process.cwd();
  await runFirstRunSetup(cwd);
  loadLocalConfig(cwd);

  const { start } = await import("./src");
  await start({ cwd });
}

bootstrap().catch((error) => {
  console.error("Failed to start Mioku:", error);
  process.exit(1);
});
