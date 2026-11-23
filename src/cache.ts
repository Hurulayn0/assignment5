// Huriye Kayadelen, 2200005795
export class TaskCache {
  constructor(private kv: Deno.Kv) {}
  async get<T>(
    owner: number,
    id: number,
    load: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const key = ["task", owner, id];
    const entry = await this.kv.get<{ value?: T }>(key);
    if (entry.value?.value !== undefined) return entry.value.value;
    const value = await load();
    if (value !== undefined) {
      await this.kv.atomic().check(entry).set(key, { value }, { expireIn: 60000 })
        .commit();
    }
    return value;
  }
  async invalidate(owner: number, id: number) {
    // Change the version even when a concurrent database read saw an empty cache.
    await this.kv.set(["task", owner, id], {}, { expireIn: 60000 });
  }
}
