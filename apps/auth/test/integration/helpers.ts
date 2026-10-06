import { AccountStore } from "../../src/accounts";
import { createApp, type Deps } from "../../src/app";
import { loadConfig, type Config } from "../../src/config";
import { CouchAdmin } from "../../src/couch";
import { Provisioner } from "../../src/provisioning";
import { RateLimiter } from "../../src/ratelimit";

export const COUCH_URL = process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984";
const ADMIN_USER = process.env["COUCHDB_ADMIN_USER"] ?? process.env["COUCHDB_USER"] ?? "admin";
const ADMIN_PASS = process.env["COUCHDB_ADMIN_PASSWORD"] ?? process.env["COUCHDB_PASSWORD"] ?? "spike-admin-pass";
/** Même clé que infra/couchdb/local.ini (clé de développement, jamais de production). */
export const DEV_SECRET_B64 = Buffer.from("dev-only-secret-change-me-32-bytes!!").toString("base64");

export type Ctx = Awaited<ReturnType<typeof bootstrap>>;

/** Prépare un service neuf sur une base de comptes jetable, face à un vrai CouchDB (voir apps/auth/README.md). */
export async function bootstrap(overrides: Partial<Record<string, string>> = {}, deps: Partial<Deps> = {}) {
  const couch = new CouchAdmin(COUCH_URL, ADMIN_USER, ADMIN_PASS);
  const up = await couch.request("GET", "").catch(() => null);
  if (!up || up.status !== 200) throw new Error(`CouchDB injoignable sur ${COUCH_URL} : lancez docker compose -f infra/docker-compose.yml up -d`);
  for (const db of ["_users", "_replicator"]) await couch.ensureDb(db);

  const accountsDb = `acc_test_${Math.random().toString(36).slice(2, 10)}`;
  const config: Config = loadConfig({
    COUCHDB_URL: COUCH_URL,
    COUCHDB_ADMIN_USER: ADMIN_USER,
    COUCHDB_ADMIN_PASSWORD: ADMIN_PASS,
    ACCOUNTS_DB: accountsDb,
    JWT_SECRET: DEV_SECRET_B64,
    JWT_KID: "dev",
    COOKIE_SECURE: "false",
    ...overrides,
  });
  const accounts = new AccountStore(couch, accountsDb);
  await accounts.init();
  const provisioner = new Provisioner(couch);
  let offset = 0;
  const clock = () => Date.now() + offset;
  // limites larges par défaut : les tests de limitation en fournissent de plus étroites
  const open = (n = 10_000) => new RateLimiter(n, 60_000, clock);
  const app = createApp({ config, accounts, provisioner, clock, limits: { login: open(), loginUser: open(), signup: open(), refresh: open() }, ...deps });
  const created: string[] = [];

  async function call(method: string, path: string, o: { body?: unknown; token?: string; cookie?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.body !== undefined) headers["content-type"] = "application/json";
    if (o.token) headers["authorization"] = `Bearer ${o.token}`;
    if (o.cookie) headers["cookie"] = o.cookie;
    const res = await app.request(path, { method, headers, body: o.body === undefined ? null : JSON.stringify(o.body) });
    const setCookie = res.headers.get("set-cookie");
    const text = await res.text();
    return {
      status: res.status,
      json: text ? (JSON.parse(text) as any) : null,
      headers: res.headers,
      /** `toccata_rt=…` prêt à renvoyer ; chaîne vide si le cookie a été effacé ; `null` s'il n'a pas changé. */
      cookie: setCookie ? (/Max-Age=0/i.test(setCookie) || /toccata_rt=;/.test(setCookie) ? "" : setCookie.split(";")[0]!) : null,
      setCookie,
    };
  }

  const refreshHeaders = { "x-requested-with": "toccata" };
  const PASSWORD = "correct horse battery staple";

  async function signupTeacher(username: string, locale: "fr" | "en" = "fr") {
    const r = await call("POST", "/auth/teachers", { body: { username, displayName: `Prof ${username}`, password: PASSWORD, locale } });
    if (r.status !== 201) throw new Error(`inscription : ${r.status} ${JSON.stringify(r.json)}`);
    return { token: r.json.accessToken as string, cookie: r.cookie!, id: r.json.user.id as string, username };
  }

  async function login(username: string, password: string) {
    const r = await call("POST", "/auth/login", { body: { username, password } });
    return r;
  }

  async function refresh(cookie: string) {
    return call("POST", "/auth/refresh", { cookie, headers: refreshHeaders });
  }

  async function makeClass(teacherToken: string, names: string[], name = "4e B") {
    const k = await call("POST", "/classes", { token: teacherToken, body: { name } });
    const s = await call("POST", `/classes/${k.json.id}/students`, { token: teacherToken, body: { names } });
    return { classId: k.json.id as string, students: s.json.students as { id: string; username: string; displayName: string; passphrase: string }[] };
  }

  async function cleanup() {
    for (const db of created) await couch.dropDb(db);
    await couch.dropDb(accountsDb);
  }

  return {
    app, call, couch, config, accounts, accountsDb, signupTeacher, login, refresh, makeClass, cleanup, created, refreshHeaders, PASSWORD,
    advance: (ms: number) => { offset += ms; },
    track: (db: string) => { created.push(db); },
  };
}

export const rolesOf = (token: string): string[] => JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString())._couchdb.roles;

/** `fetch` vers CouchDB avec un jeton de l'utilisateur. */
export const asUser = (token: string) => (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(`${COUCH_URL}/${path}`, { ...init, headers });
};
