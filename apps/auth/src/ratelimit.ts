/** Limiteur à fenêtre glissante, en mémoire (suffisant pour un seul processus ; à remplacer pour plusieurs instances). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Enregistre un événement ; renvoie `retryAfterMs` > 0 si la limite est dépassée, sinon 0. */
  hit(key: string): number {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return this.windowMs - (t - recent[0]!);
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(t);
    return 0;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.every((x) => t - x >= this.windowMs)) this.hits.delete(k);
  }
}
