import { describe, expect, it, vi } from "vitest";
import { Session } from "./session";

const user = { id: "u1", role: "teacher" as const, username: "marie", displayName: "Marie", locale: "fr" as const };
const ok = (token: string, expiresIn = 900) => new Response(JSON.stringify({ accessToken: token, expiresIn, user }), { status: 200 });
const err = (status: number, error: string) => new Response(JSON.stringify({ error }), { status });

function setup(handler: (path: string, init: RequestInit) => Response | Promise<Response>, stored: Record<string, string> = {}) {
  let t = 1_000_000;
  const timers: { f: () => void; at: number; h: number }[] = [];
  let h = 0;
  const calls: string[] = [];
  const store = new Map(Object.entries(stored));
  const s = new Session({
    fetch: async (path, init = {}) => {
      calls.push(`${init.method ?? "GET"} ${path}`);
      return handler(path, init);
    },
    now: () => t,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
    setTimer: (f, ms) => { const x = { f, at: t + ms, h: ++h }; timers.push(x); return x.h; },
    clearTimer: (id) => { const i = timers.findIndex((x) => x.h === id); if (i >= 0) timers.splice(i, 1); },
  });
  return { s, calls, store, advance: (ms: number) => { t += ms; for (const x of [...timers].filter((x) => x.at <= t)) { timers.splice(timers.indexOf(x), 1); x.f(); } }, timers };
}

describe("Session", () => {
  it("se connecte, garde le jeton en mémoire seulement, et met en cache le profil public", async () => {
    const { s, store } = setup(() => ok("tok1"));
    await s.login("marie", "x");
    expect(s.getState()).toEqual({ status: "authenticated", user, offline: false });
    expect(await s.getAccessToken()).toBe("tok1");
    expect([...store.values()].join()).not.toContain("tok1"); // le jeton n'est jamais stocké
    expect(JSON.parse(store.get("toccata.profile")!)).toEqual(user);
  });

  it("reprend la session au démarrage grâce au cookie (appel /auth/refresh avec l'en-tête anti-CSRF)", async () => {
    const seen: RequestInit[] = [];
    const { s } = setup((_p, init) => { seen.push(init); return ok("t"); });
    await s.bootstrap();
    expect(s.getState().status).toBe("authenticated");
    expect((seen[0]!.headers as Record<string, string>)["x-requested-with"]).toBe("toccata");
    expect(seen[0]!.credentials).toBe("same-origin");
  });

  it("devient anonyme et oublie tout quand le serveur refuse le rafraîchissement", async () => {
    const { s, store } = setup(() => err(401, "invalid_refresh"), { "toccata.profile": JSON.stringify(user) });
    await s.bootstrap();
    expect(s.getState()).toEqual({ status: "anonymous", user: null, offline: false });
    expect(store.has("toccata.profile")).toBe(false);
  });

  it("sans réseau, ouvre la session depuis le profil en cache (hors ligne), sans jeton", async () => {
    const { s } = setup(() => { throw new TypeError("Failed to fetch"); }, { "toccata.profile": JSON.stringify(user) });
    await s.bootstrap();
    expect(s.getState()).toEqual({ status: "authenticated", user, offline: true });
    await expect(s.getAccessToken()).rejects.toMatchObject({ code: "network" });
  });

  it("sans réseau et sans profil en cache : anonyme", async () => {
    const { s } = setup(() => { throw new TypeError("Failed to fetch"); });
    await s.bootstrap();
    expect(s.getState().status).toBe("anonymous");
  });

  it("renouvelle le jeton avant son expiration", async () => {
    let n = 0;
    const { s, calls, advance } = setup(() => ok(`tok${++n}`, 900));
    await s.login("marie", "x");
    advance(839_000); // juste avant « expiration − 1 min »
    expect(calls.filter((c) => c.includes("/api/auth/refresh"))).toHaveLength(0);
    advance(2_000);
    await vi.waitFor(() => expect(calls.filter((c) => c.includes("/api/auth/refresh"))).toHaveLength(1));
    await vi.waitFor(async () => expect(await s.getAccessToken()).toBe("tok2"));
  });

  it("n'envoie qu'un seul /auth/refresh pour des requêtes simultanées (vol unique)", async () => {
    let gate!: () => void;
    const wait = new Promise<void>((r) => (gate = r));
    const { s, calls } = setup(async () => { await wait; return ok("tok-r"); });
    const all = Promise.all([s.getAccessToken(), s.getAccessToken(), s.getAccessToken(), s.getAccessToken()]);
    gate();
    expect(await all).toEqual(["tok-r", "tok-r", "tok-r", "tok-r"]);
    expect(calls.filter((c) => c.includes("/api/auth/refresh"))).toHaveLength(1);
  });

  it("rejoue une requête une fois après renouvellement quand le jeton est refusé (401, 400 ou 403)", async () => {
    for (const status of [401, 400, 403]) {
      let issued = 0;
      const { s } = setup((path, init) => {
        if (path === "/api/auth/login") return ok("old");
        if (path === "/api/auth/refresh") return ok("new");
        const bearer = new Headers(init.headers).get("authorization");
        return bearer === "Bearer new" ? new Response("ok", { status: 200 }) : (issued++, new Response("{}", { status }));
      });
      await s.login("marie", "x");
      const res = await s.authorizedFetch("/couch/db");
      expect(res.status, `statut ${status}`).toBe(200);
      expect(issued).toBe(1);
    }
  });

  it("ne boucle pas : si le renouvellement échoue, la réponse d'origine est rendue", async () => {
    const { s, calls } = setup((path) => (path === "/api/auth/login" ? ok("old") : path === "/api/auth/refresh" ? err(401, "invalid_refresh") : new Response("{}", { status: 403 })));
    await s.login("marie", "x");
    const res = await s.authorizedFetch("/couch/db");
    expect(res.status).toBe(403);
    expect(calls.filter((c) => c.includes("/couch/db"))).toHaveLength(1);
    expect(s.getState().status).toBe("anonymous");
  });

  it("se déconnecte même sans réseau", async () => {
    const { s, store } = setup((path) => { if (path === "/api/auth/login") return ok("t"); throw new TypeError("offline"); });
    await s.login("marie", "x");
    await s.logout();
    expect(s.getState().status).toBe("anonymous");
    expect(store.has("toccata.profile")).toBe(false);
    await expect(s.getAccessToken()).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("propage les codes d'erreur de l'API (jamais une phrase)", async () => {
    const { s } = setup(() => new Response(JSON.stringify({ error: "locked", retryAfterSeconds: 60 }), { status: 429 }));
    await expect(s.login("marie", "x")).rejects.toMatchObject({ code: "locked", status: 429, details: { retryAfterSeconds: 60 } });
    const { s: s2 } = setup(() => { throw new TypeError("x"); });
    await expect(s2.login("m", "x")).rejects.toMatchObject({ code: "network", status: 0 });
  });

  it("notifie les abonnés et se désabonne", async () => {
    const { s } = setup(() => ok("t"));
    const spy = vi.fn();
    const off = s.subscribe(spy);
    await s.login("marie", "x");
    expect(spy).toHaveBeenCalled();
    off();
    spy.mockClear();
    await s.logout();
    expect(spy).not.toHaveBeenCalled();
  });
});
