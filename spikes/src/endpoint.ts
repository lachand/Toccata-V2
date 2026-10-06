export type Endpoint = { name: string; url: string };

/** Sonde de santé CouchDB (`/_up`), avec délai court pour détecter vite un hotspot sans Internet. */
export async function probe(url: string, timeoutMs = 800): Promise<boolean> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(`${url}/_up`, { signal: c.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

type Replication = { cancel(): Promise<unknown> | unknown };

/**
 * Choisit le premier endpoint sain dans l'ordre de préférence (serveur local → cloud) et
 * relance la réplication quand il change. `null` = hors ligne (l'appareil reste utilisable seul).
 * Le `startSync` reçoit l'endpoint : l'identifiant de réplication DOIT inclure son nom, car les
 * séquences (checkpoints) de deux serveurs CouchDB ne sont pas comparables.
 */
export class SyncManager {
  current: Endpoint | null = null;
  history: (string | null)[] = [];
  private repl: Replication | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private candidates: Endpoint[],
    private startSync: (e: Endpoint) => Replication,
    private intervalMs = 500,
  ) {}

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      let best: Endpoint | null = null;
      for (const c of this.candidates) {
        if (await probe(c.url)) {
          best = c;
          break;
        }
      }
      if (best?.name === this.current?.name) return;
      await this.repl?.cancel();
      this.repl = best ? this.startSync(best) : null;
      this.current = best;
      this.history.push(best?.name ?? null);
    } finally {
      this.busy = false;
    }
  }

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.repl?.cancel();
  }
}
