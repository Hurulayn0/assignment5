// Huriye Kayadelen, 2200005795
import { drizzle } from "drizzle-orm/libsql";
import { migrate as applyMigrations } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import * as schema from "./schema.ts";
export type Db = ReturnType<typeof createDb>;
export function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  return { client, db: drizzle(client, { schema }) };
}
export async function migrate({ db }: Db) {
  await applyMigrations(db, { migrationsFolder: "./drizzle" });
}
