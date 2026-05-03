export class Semaphore {
  private count: number;
  private queue: Array<() => void> = [];

  constructor(public readonly maxConcurrency: number) {
    this.count = maxConcurrency;
  }

  async acquire(): Promise<() => void> {
    if (this.count > 0) {
      this.count--;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}

export function withLimit<T>(semaphore: Semaphore, fn: () => Promise<T>): Promise<T> {
  return semaphore.acquire().then(async (release) => {
    try {
      return await fn();
    } finally {
      release();
    }
  });
}
