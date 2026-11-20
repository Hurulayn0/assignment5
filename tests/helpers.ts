// STUDENT NAME, STUDENT NUMBER
import { createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";

/**
 * Every test gets a fresh, empty database in its own temporary file.
 * (An in-memory database loses its tables after a transaction with libSQL,
 * so a temporary file is the safe choice.)
 */
export async function freshApp() {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  const dispose = () => {
    db.client.close();
    // libSQL can hold the native file handle after close() on Windows.
  };
  try {
    await migrate(db);
    return Object.assign(createApp(db), { database: db, [Symbol.dispose]: dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}
