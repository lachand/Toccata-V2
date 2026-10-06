import { SignJWT } from "jose";

/** Deux CouchDB de dev (infra/docker-compose.yml) : "cloud" et "local" (serveur de classe). */
export const CLOUD = process.env.COUCH_CLOUD_URL ?? "http://127.0.0.1:5984";
export const LOCAL = process.env.COUCH_LOCAL_URL ?? "http://127.0.0.1:5985";
export const ADMIN_USER = process.env.COUCHDB_USER ?? "admin";
export const ADMIN_PASS = process.env.COUCHDB_PASSWORD ?? "spike-admin-pass";
const adminAuth = "Basic " + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString("base64");

/** Même clé que infra/couchdb/local.ini (clé de dev, jamais de production). */
const SECRET = new TextEncoder().encode("dev-only-secret-change-me-32-bytes!!");

export async function mintJwt(
  sub: string,
  roles: string[],
  opts: { expiresIn?: string; secret?: Uint8Array } = {},
): Promise<string> {
  return new SignJWT({ _couchdb: { roles } })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "dev" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "15m")
    .sign(opts.secret ?? SECRET);
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function bearerFetch(token: string): Fetcher {
  return (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
}

export const adminFetch: Fetcher = (url, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Authorization", adminAuth);
  return fetch(url, { ...init, headers });
};

export async function waitForCouch(base: string, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await adminFetch(base + "/");
      if (r.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`CouchDB injoignable : ${base}`);
}

export async function resetDb(base: string, name: string): Promise<void> {
  await adminFetch(`${base}/${name}`, { method: "DELETE" });
  const r = await adminFetch(`${base}/${name}`, { method: "PUT" });
  if (!r.ok) throw new Error(`création ${name}: ${r.status} ${await r.text()}`);
}

export async function putJson(f: Fetcher, url: string, body: unknown): Promise<Response> {
  return f(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function ensureSystemDbs(base: string): Promise<void> {
  for (const db of ["_users", "_replicator", "_global_changes"]) {
    await adminFetch(`${base}/${db}`, { method: "PUT" });
  }
}

export class CouchAuthError extends Error {
  constructor(public status: number, public url: string) {
    super(`CouchDB ${status} sur ${url}`);
  }
}

/**
 * Enveloppe de fetch pour RxDB :
 *  - renouvelle le jeton une fois sur 400/401 (jeton expiré),
 *  - transforme les refus (401/403) et erreurs serveur (5xx) de LECTURE en exception : sans cela le plugin
 *    replication-couchdb lève un rejet non géré (`results` indéfini) sur une base interdite.
 */
export function guardedFetch(getToken: () => Promise<string>, refresh: () => Promise<string>): Fetcher {
  return async (url, init) => {
    let res = await bearerFetch(await getToken())(url, init);
    if (res.status === 400 || res.status === 401) {
      res = await bearerFetch(await refresh())(url, init);
    }
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && (res.status === 401 || res.status === 403 || res.status >= 500)) {
      throw new CouchAuthError(res.status, url);
    }
    return res;
  };
}
