// Huriye Kayadelen, 2200005795
import type { Config } from "drizzle-kit";
export default {
  dialect: "sqlite",
  schema: Deno.env.get("MIGRATION_SCHEMA") ?? "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: Deno.env.get("DATABASE_URL") ?? "file:./tasks.db" },
} satisfies Config;
