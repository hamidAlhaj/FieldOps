// Cross-platform browser fixture; never points to production APIs.
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const api = process.argv[2] === "api";
const args = ["run", "dev", "--", "--port", api ? "5175" : "5174"];
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
  cwd: resolve(__dirname, ".."),
  env: {
    ...process.env,
    VITE_DATA_SOURCE: api ? "api" : "demo",
    ...(api ? { FIELDOPS_API_PROXY: "http://127.0.0.1:3001" } : {}),
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
