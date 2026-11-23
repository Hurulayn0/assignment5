// Huriye Kayadelen, 2200005795
import { strictEqual } from "node:assert";
import { TaskCache } from "../src/cache.ts";
Deno.test("cache reuses reads, isolates owners and invalidates changes", async () => {
  using kv = await Deno.openKv(":memory:");
  const cache = new TaskCache(kv);
  let reads = 0;
  const load = () => Promise.resolve(++reads);
  strictEqual(await cache.get(1, 8, load), 1);
  strictEqual(await cache.get(1, 8, load), 1);
  strictEqual(await cache.get(2, 8, load), 2);
  await cache.invalidate(1, 8);
  strictEqual(await cache.get(1, 8, load), 3);
  strictEqual(reads, 3);
});
