import "dotenv/config";
import { z } from "zod";
const schema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(ql)?:/.test(value)),
    JWT_ACCESS_SECRET: z.string().min(64),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((config, context) => {
    let origin: URL;
    try {
      origin = new URL(config.WEB_ORIGIN);
    } catch {
      return;
    }
    if (origin.origin !== config.WEB_ORIGIN)
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "Must be an exact origin without a path",
      });
    if (
      config.NODE_ENV === "production" &&
      !config.WEB_ORIGIN.startsWith("https://")
    )
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "HTTPS required in production",
      });
  });
export function readEnvironment() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid environment fields: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  return result.data;
}
