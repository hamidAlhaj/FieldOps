const { spawn, spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { randomBytes } = require("node:crypto");
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must point to a dedicated _test database");
const env = {
  ...process.env,
  DATABASE_URL: url,
  JWT_ACCESS_SECRET: randomBytes(64).toString("hex"),
  NODE_ENV: "test",
  PORT: "3001",
  WEB_ORIGIN: "http://127.0.0.1:5175",
};
const cwd = resolve(__dirname, "../../..");
const migration = spawnSync(
  "npm",
  ["exec", "-w", "@fieldops/api", "--", "prisma", "migrate", "deploy"],
  { cwd, env, stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const child = spawn("node", ["dist/main.js"], {
  cwd: resolve(cwd, "apps/api"),
  env,
  stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
