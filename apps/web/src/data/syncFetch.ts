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
    // 404 sur `_changes` : la base n'existe pas ENCORE (un serveur de classe qui rattrape le cloud la crée par réplication) ;
    // le plugin ne sait pas le gérer, on le lui présente comme une panne passagère qu'il réessaiera.
    const missingFeed = res.status === 404 && String(input).includes("/_changes");
    if (method === "GET" && (res.status === 401 || res.status === 403 || res.status >= 500 || missingFeed)) throw new SyncReadError(res.status);
    return res;
  }) as typeof fetch;
