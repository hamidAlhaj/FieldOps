// Explicit dedicated database only; never reset or migrate the development DB here.
require("dotenv/config");
const { spawnSync } = require("node:child_process");
const value = process.env.TEST_DATABASE_URL;
if (!value)
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated database ending in _test",
  );
const url = new URL(value);
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !decodeURIComponent(url.pathname).endsWith("_test") ||
  (url.searchParams.get("schema") &&
    url.searchParams.get("schema") !== "public")
)
  throw new Error(
    "Integration database must end in _test and use public schema",
  );
process.env.DATABASE_URL = value;
process.env.NODE_ENV = "test";
for (const args of [
  ["prisma", "migrate", "deploy"],
  ["jest", "--runInBand", "--config", "jest.integration.config.cjs"],
]) {
  const result = spawnSync("npx", ["--no-install", ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
