const { spawnSync } = require("node:child_process");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "playwright", "test"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, FIELDOPS_E2E_API: "true" },
  },
);
process.exit(result.status ?? 1);
