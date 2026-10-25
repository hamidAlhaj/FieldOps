const {
  existsSync,
  readFileSync,
  appendFileSync,
  chmodSync,
} = require("node:fs");
const { randomBytes } = require("node:crypto");
if (process.env.NODE_ENV === "production")
  throw new Error(
    "Configure production signing secrets through your secret manager",
  );
if (!existsSync(".env"))
  throw new Error("Copy apps/api/.env.example to apps/api/.env first");
if (!/^JWT_ACCESS_SECRET=.+$/m.test(readFileSync(".env", "utf8"))) {
  appendFileSync(
    ".env",
    `\nJWT_ACCESS_SECRET=${randomBytes(64).toString("hex")}\n`,
    { mode: 0o600 },
  );
}
console.log("Local JWT signing secret configured; value not displayed.");

chmodSync(".env", 0o600);
