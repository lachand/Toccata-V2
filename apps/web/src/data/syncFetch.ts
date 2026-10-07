import type { Fetcher } from "../auth/api";

/** Refus de lecture ou panne serveur pendant la réplication. */
export class SyncReadError extends Error {
  constructor(readonly status: number) {
    super(`sync ${status}`);
  }
}

/**
 * `fetch` pour la réplication : le plugin replication-couchdb lève un rejet non géré (`results` indéfini) sur une
 * lecture refusée ou en panne ; on la transforme en exception, que la réplication sait réessayer (spike a).
 */
export const syncFetch = (authorized: Fetcher): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await authorized(String(input), init);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && (res.status === 401 || res.status === 403 || res.status >= 500)) throw new SyncReadError(res.status);
    return res;
  }) as typeof fetch;
