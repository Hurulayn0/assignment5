// Huriye Kayadelen, 2200005795
import type { Db } from "./db.ts";
import type { TaskCache } from "./cache.ts";
export async function purgeOldDone({ client }: Db, days = 30, cache?: TaskCache) {
  const result = await client.execute({
    sql: "DELETE FROM tasks WHERE status='done' AND done_at < ? RETURNING user_id,id",
    args: [Math.floor(Date.now() / 1000) - days * 86400],
  });
  for (const row of result.rows) {
    await cache?.invalidate(Number(row.user_id), Number(row.id));
  }
  return result.rows.length;
}
