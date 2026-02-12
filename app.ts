import { loadLocalConfig } from "./src/config-loader";

loadLocalConfig(process.cwd());

import("./src").then(({ start }) => {
  start({
    cwd: process.cwd(),
  }).catch((error) => {
    console.error("Failed to start Mioku:", error);
    process.exit(1);
  });
});
