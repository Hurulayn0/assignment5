// Huriye Kayadelen, 2200005795
export class Pool<T> {
  private idle: T[];
  private waiting: Array<(value: T) => void> = [];
  constructor(items: T[]) {
    if (!items.length) throw Error("Pool requires at least one item");
    this.idle = [...items];
  }
  private acquire(): Promise<T> {
    if (this.idle.length) return Promise.resolve(this.idle.pop()!);
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  async use<R>(work: (item: T) => Promise<R> | R): Promise<R> {
    const item = await this.acquire();
    try {
      return await work(item);
    } finally {
      const next = this.waiting.shift();
      if (next) next(item);
      else this.idle.push(item);
    }
  }
}
