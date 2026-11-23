// Huriye Kayadelen, 2200005795
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

/** Open a database. Tests pass "file::memory:" or a temporary file. */
export function createDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  return { db, client };
}

/** Create the tables if they do not exist yet. Keep this in sync with schema.ts. */
export async function migrate({ client }: Db) {
  await client.batch([
    "CREATE TABLE IF NOT EXISTS login_failures(email TEXT PRIMARY KEY, failures INTEGER NOT NULL, reset_at INTEGER NOT NULL)",
    `CREATE TABLE IF NOT EXISTS users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT NOT NULL UNIQUE,
       password_hash TEXT NOT NULL,
       created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
     )`,
    `CREATE TABLE IF NOT EXISTS sessions (
       token TEXT PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id),
       expires_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS tasks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL REFERENCES users(id),
       title TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'todo',
       priority TEXT NOT NULL DEFAULT 'medium',
       created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
       CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'in-progress', 'done')),
       CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high'))
     )`,
    "CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id,status)",
  ]);
  const userCols = await client.execute("PRAGMA table_info(users)");
  if (!userCols.rows.some((r) => r.name === "role")) {
    await client.execute(
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))",
    );
  }
  const taskCols = await client.execute("PRAGMA table_info(tasks)");
  if (!taskCols.rows.some((r) => r.name === "attachment")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN attachment TEXT");
  }
  if (!taskCols.rows.some((r) => r.name === "deleted_at")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN deleted_at INTEGER");
  }
  if (!taskCols.rows.some((r) => r.name === "done_at")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN done_at INTEGER");
    await client.execute("UPDATE tasks SET done_at=unixepoch() WHERE status='done'");
  }
}
