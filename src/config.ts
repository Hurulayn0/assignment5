// Huriye Kayadelen, 2200005795
import { z } from "zod";
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().regex(/^(file:|libsql:\/\/|https:\/\/).+/).default(
    "file:./tasks.db",
  ),
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1).default("dev-secret"),
  AUTH_MODE: z.enum(["session", "jwt"]).default("session"),
}).superRefine((v, ctx) => {
  if (
    v.APP_ENV === "production" &&
    (v.JWT_SECRET === "dev-secret" || v.JWT_SECRET.length < 32)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "Production requires a secret of at least 32 characters",
    });
  }
});
export function configuration(values: Record<string, string | undefined>) {
  return schema.parse(values);
}
