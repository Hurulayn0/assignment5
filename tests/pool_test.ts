// Huriye Kayadelen, 2200005795
import { rejects, strictEqual } from "node:assert";
import { Pool } from "../src/pool.ts";
Deno.test("20 jobs finish on three connections including release after failure", async () => {
  const pool = new Pool([1, 2, 3]);
  let active = 0, peak = 0, finished = 0;
  await rejects(pool.use(() => {
    throw Error("fixture");
  }));
  await Promise.all(Array.from({ length: 20 }, () =>
    pool.use(async () => {
      active++;
      peak = Math.max(active, peak);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      finished++;
    })));
  strictEqual(peak, 3);
  strictEqual(finished, 20);
});
