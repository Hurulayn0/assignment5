// Huriye Kayadelen, 2200005795
import type { Db } from "./db.ts";

export async function retryAfter(database: Db, email: string) {
  const result = await database.client.execute({
    sql:
      "SELECT reset_at FROM login_failures WHERE email=? AND failures>=5 AND reset_at>?",
    args: [email, Date.now()],
  });
  if (!result.rows.length) return 0;
  return Math.max(1, Math.ceil((Number(result.rows[0].reset_at) - Date.now()) / 1000));
}
export async function recordFailure(database: Db, email: string) {
  const now = Date.now();
  await database.client.batch([
    { sql: "DELETE FROM login_failures WHERE reset_at<=?", args: [now] },
    {
      sql:
        "INSERT INTO login_failures(email,failures,reset_at) VALUES (?,1,?) ON CONFLICT(email) DO UPDATE SET failures=failures+1",
      args: [email, now + 60000],
    },
  ], "write");
}
export async function clearFailures(database: Db, email: string) {
  await database.client.execute({
    sql: "DELETE FROM login_failures WHERE email=?",
    args: [email],
  });
}
