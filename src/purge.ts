// Huriye Kayadelen, 2200005795
import type { Db } from "./db.ts";
export async function purgeOldDone({ client }: Db, days = 30) {
  const result = await client.execute({
    sql: "DELETE FROM tasks WHERE status='done' AND done_at < ?",
    args: [Math.floor(Date.now() / 1000) - days * 86400],
  });
  return result.rowsAffected;
}
