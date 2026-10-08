import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LoginGuard } from "../../src/loginguard";
import { RateLimiter } from "../../src/ratelimit";
import { bootstrap, rolesOf, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await bootstrap(); });
afterAll(async () => { await ctx.cleanup(); });

describe("inscription et connexion d'un enseignant", () => {
  it("inscrit, connecte, et renvoie un profil sans secret", async () => {
    const r = await ctx.call("POST", "/auth/teachers", { body: { username: "Marie.Durand", displayName: "Marie Durand", password: ctx.PASSWORD, locale: "fr" } });
    expect(r.status).toBe(201);
    expect(r.json.user).toEqual({ id: expect.any(String), role: "teacher", username: "marie.durand", displayName: "Marie Durand", locale: "fr" }); // identifiant normalisé en minuscules
    expect(JSON.stringify(r.json)).not.toMatch(/passwordHash|argon2/);
    const me = await ctx.call("GET", "/auth/me", { token: r.json.accessToken });
    expect(me.status).toBe(200);
    expect(me.json.username).toBe("marie.durand");
    expect(rolesOf(r.json.accessToken)).toEqual([`owner:${r.json.user.id}`, "teacher"]);
  });

  it("sonde de santé : 200 sans détail tant que la base de comptes répond", async () => {
    const r = await ctx.call("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
  });

  it("pose un cookie de rafraîchissement HttpOnly, SameSite=Strict, limité à /auth", async () => {
    const r = await ctx.call("POST", "/auth/teachers", { body: { username: "cookie.teacher", displayName: "C", password: ctx.PASSWORD } });
    expect(r.setCookie).toMatch(/toccata_rt=/);
    expect(r.setCookie).toMatch(/HttpOnly/i);
    expect(r.setCookie).toMatch(/SameSite=Strict/i);
    expect(r.setCookie).toMatch(/Path=\/api\/auth/i); // le navigateur voit l'API sous /api
  });

  it("refuse un identifiant déjà pris, quelle que soit la casse", async () => {
    await ctx.signupTeacher("unique.name");
    const r = await ctx.call("POST", "/auth/teachers", { body: { username: "UNIQUE.NAME", displayName: "X", password: ctx.PASSWORD } });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "username_taken" });
  });

  it("refuse un mot de passe faible avec la raison (un code, pas une phrase)", async () => {
    const r = await ctx.call("POST", "/auth/teachers", { body: { username: "weak.one", displayName: "W", password: "court" } });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "weak_password", reason: "too_short" });
  });

  it("valide les entrées", async () => {
    for (const body of [{}, { username: "x", displayName: "a", password: "x".repeat(20) }, { username: "ok.name", displayName: "", password: "x".repeat(20) }, { username: "ok.name", displayName: "a", password: "x".repeat(500) }]) {
      const r = await ctx.call("POST", "/auth/teachers", { body });
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.error).toBe("invalid_input");
    }
    const raw = await ctx.app.request("/auth/teachers", { method: "POST", headers: { "content-type": "application/json" }, body: "{pas du json" });
    expect(raw.status).toBe(400);
  });

  it("refuse les corps trop gros", async () => {
    const r = await ctx.app.request("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "a", password: "x".repeat(200_000) }) });
    expect(r.status).toBe(413);
  });
});

describe("connexion : pas de fuite d'information", () => {
  it("répond pareil pour un compte inconnu et un mauvais mot de passe", async () => {
    await ctx.signupTeacher("known.user");
    const wrong = await ctx.login("known.user", "mauvais mot de passe long");
    const unknown = await ctx.login("nobody.here", "mauvais mot de passe long");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json);
    expect(wrong.json).toEqual({ error: "invalid_credentials" });
  });

  it("verrouille temporairement après 5 échecs, puis libère", async () => {
    await ctx.signupTeacher("lock.me");
    for (let i = 0; i < 5; i++) expect((await ctx.login("lock.me", "mauvais mot de passe " + i)).status).toBe(401);
    const locked = await ctx.login("lock.me", ctx.PASSWORD); // même le bon mot de passe est refusé pendant le verrouillage
    expect(locked.status).toBe(429);
    expect(locked.json.error).toBe("locked");
    expect(locked.json.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.json.retryAfterSeconds).toBeLessThanOrEqual(60);
    ctx.advance(61_000);
    expect((await ctx.login("lock.me", ctx.PASSWORD)).status).toBe(200);
    expect((await ctx.login("lock.me", ctx.PASSWORD)).status).toBe(200); // compteur remis à zéro
  });

  it("allonge le verrouillage à chaque série d'échecs", async () => {
    await ctx.signupTeacher("lock.more");
    for (let i = 0; i < 5; i++) await ctx.login("lock.more", "mauvais mot de passe " + i);
    ctx.advance(61_000);
    await ctx.login("lock.more", "mauvais encore"); // 6e échec : 120 s
    const r = await ctx.login("lock.more", ctx.PASSWORD);
    expect(r.json.retryAfterSeconds).toBeGreaterThan(60);
  });
});

describe("limitation de débit : classes derrière une même adresse, attaques horizontales", () => {
  it("toute une classe qui se connecte en même temps depuis la même adresse ne se bloque pas", async () => {
    const c = await bootstrap();
    try {
      const t = await c.signupTeacher("nat.teacher");
      const names = Array.from({ length: 35 }, (_, i) => `Eleve Numero${String.fromCharCode(97 + (i % 26))}${i}`);
      const { students } = await c.makeClass(t.token, names);
      expect(students).toHaveLength(35);
      for (const s of students) expect((await c.login(s.username, s.passphrase)).status, s.username).toBe(200); // 35 succès, même adresse
      // et 35 fautes de frappe d'élèves différents ne bloquent pas non plus la 36e personne
      for (const s of students) expect((await c.login(s.username, "faute de frappe")).status).toBe(401);
      expect((await c.login(students[0]!.username, students[0]!.passphrase)).status).toBe(200);
    } finally { await c.cleanup(); }
  }, 120_000);

  it("une attaque horizontale (même mot de passe sur beaucoup de comptes) est stoppée net, par adresse", async () => {
    const c = await bootstrap();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 45; i++) codes.push((await c.login(`victime.${i}`, "motdepasse-courant")).status);
      expect(codes.slice(0, 40).every((x) => x === 401)).toBe(true);
      expect(codes.slice(40).every((x) => x === 429)).toBe(true); // à partir du 41e identifiant distinct
      const r = await c.login("victime.50", "x");
      expect(r.json).toMatchObject({ error: "rate_limited", retryAfterSeconds: expect.any(Number) });
    } finally { await c.cleanup(); }
  }, 120_000);

  it("refuse les mots de passe d'enseignant courants, avec la raison", async () => {
    for (const weak of ["azertyuiop123", "motdepasse2024!!", "Bonjour123456"]) {
      const r = await ctx.call("POST", "/auth/teachers", { body: { username: "weak.pw", displayName: "Marie Durand", password: weak } });
      expect(r.status, weak).toBe(400);
      expect(r.json, weak).toEqual({ error: "weak_password", reason: "too_common" });
    }
    const named = await ctx.call("POST", "/auth/teachers", { body: { username: "weak.pw", displayName: "Marie Durand", password: "Durand-2024-xk!q9Z" } });
    expect(named.json).toEqual({ error: "weak_password", reason: "contains_username" });
  });

  it("bloque les rafales par identifiant", async () => {
    const c = await bootstrap({}, { limits: { guard: new LoginGuard({ userAttempts: 3 }), signup: new RateLimiter(2, 60_000), refresh: new RateLimiter(100, 60_000) } });
    try {
      for (let i = 0; i < 3; i++) expect((await c.login("someone", "x" + i)).status).toBe(401);
      const r = await c.login("someone", "x4");
      expect(r.status).toBe(429);
      expect(r.json).toMatchObject({ error: "rate_limited", retryAfterSeconds: expect.any(Number) });
      // une autre cible n'est pas gênée
      expect((await c.login("someone.else", "x")).status).toBe(401);
      // inscriptions : 2 par fenêtre
      expect((await c.call("POST", "/auth/teachers", { body: { username: "s.one", displayName: "a", password: c.PASSWORD } })).status).toBe(201);
      expect((await c.call("POST", "/auth/teachers", { body: { username: "s.two", displayName: "a", password: c.PASSWORD } })).status).toBe(201);
      expect((await c.call("POST", "/auth/teachers", { body: { username: "s.three", displayName: "a", password: c.PASSWORD } })).status).toBe(429);
    } finally { await c.cleanup(); }
  });

  it("ferme l'inscription par défaut : ni code ni ouverture explicite", async () => {
    const c = await bootstrap({ OPEN_SIGNUP: "false" });
    try {
      const r = await c.call("POST", "/auth/teachers", { body: { username: "any.one", displayName: "A", password: c.PASSWORD } });
      expect(r.status).toBe(403);
      expect(r.json).toEqual({ error: "signup_closed" });
    } finally { await c.cleanup(); }
  });

  it("exige le code d'inscription quand il est configuré", async () => {
    const c = await bootstrap({ SIGNUP_CODE: "code-etablissement-2026" });
    try {
      const body = { username: "invited.t", displayName: "I", password: c.PASSWORD };
      expect((await c.call("POST", "/auth/teachers", { body })).json.error).toBe("signup_closed");
      expect((await c.call("POST", "/auth/teachers", { body: { ...body, inviteCode: "mauvais-code-xxxxxxxx" } })).json.error).toBe("signup_closed");
      expect((await c.call("POST", "/auth/teachers", { body: { ...body, inviteCode: "code-etablissement-2026" } })).status).toBe(201);
    } finally { await c.cleanup(); }
  });
});

describe("jetons de rafraîchissement", () => {
  it("renouvelle avec rotation : un nouveau cookie à chaque fois", async () => {
    const t = await ctx.signupTeacher("refresh.rot");
    const r1 = await ctx.refresh(t.cookie);
    expect(r1.status).toBe(200);
    expect(r1.json.accessToken).toBeTruthy();
    expect(r1.cookie).toBeTruthy();
    expect(r1.cookie).not.toBe(t.cookie);
    const r2 = await ctx.refresh(r1.cookie!);
    expect(r2.status).toBe(200);
  });

  it("exige l'en-tête anti-CSRF", async () => {
    const t = await ctx.signupTeacher("csrf.test");
    const r = await ctx.call("POST", "/auth/refresh", { cookie: t.cookie });
    expect(r.status).toBe(403);
    expect((await ctx.call("POST", "/auth/logout", { cookie: t.cookie })).status).toBe(403);
  });

  it("refuse sans cookie, avec un cookie mal formé ou falsifié", async () => {
    const t = await ctx.signupTeacher("bad.cookie");
    for (const cookie of ["", "toccata_rt=", "toccata_rt=abc", "toccata_rt=" + t.cookie.split("=")[1]!.split(".")[0] + ".faux-secret"]) {
      const r = await ctx.call("POST", "/auth/refresh", { ...(cookie ? { cookie } : {}), headers: ctx.refreshHeaders });
      expect(r.status, cookie).toBe(401);
      expect(r.json.error).toBe("invalid_refresh");
    }
  });

  it("tolère un double échange rapide (deux onglets) mais révoque toute la famille si un jeton ancien est rejoué", async () => {
    const t = await ctx.signupTeacher("reuse.test");
    const first = await ctx.refresh(t.cookie);
    expect(first.status).toBe(200);
    // le même jeton, immédiatement (deux onglets) : toléré
    const twin = await ctx.refresh(t.cookie);
    expect(twin.status).toBe(200);
    // plus tard, rejeu du jeton d'origine : vol probable
    ctx.advance(30_000);
    const replay = await ctx.refresh(t.cookie);
    expect(replay.status).toBe(401);
    expect(replay.json.error).toBe("refresh_reused");
    // et la famille entière est révoquée : même le jeton légitime le plus récent ne marche plus
    const legit = await ctx.refresh(first.cookie!);
    expect(legit.status).toBe(401);
    expect(legit.json.error).toBe("invalid_refresh");
    const legit2 = await ctx.refresh(twin.cookie!);
    expect(legit2.status).toBe(401);
  });

  it("la déconnexion révoque la session et efface le cookie", async () => {
    const t = await ctx.signupTeacher("logout.test");
    const out = await ctx.call("POST", "/auth/logout", { cookie: t.cookie, headers: ctx.refreshHeaders });
    expect(out.status).toBe(204);
    expect(out.cookie).toBe("");
    expect((await ctx.refresh(t.cookie)).status).toBe(401);
  });

  it("refuse un jeton arrivé à échéance", async () => {
    const t = await ctx.signupTeacher("expired.rt");
    ctx.advance(31 * 86_400_000);
    expect((await ctx.refresh(t.cookie)).json.error).toBe("invalid_refresh");
  });
});

describe("jeton d'accès", () => {
  it("refuse l'absence de jeton, un jeton falsifié ou expiré", async () => {
    const t = await ctx.signupTeacher("access.tok");
    expect((await ctx.call("GET", "/auth/me")).status).toBe(401);
    expect((await ctx.call("GET", "/auth/me", { token: t.token + "x" })).status).toBe(401);
    expect((await ctx.call("GET", "/auth/me", { token: "n'importe quoi" })).status).toBe(401);
    ctx.advance(16 * 60_000);
    expect((await ctx.call("GET", "/auth/me", { token: t.token })).status).toBe(401);
  });

  it("en-têtes de sécurité présents", async () => {
    const r = await ctx.call("GET", "/auth/me");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBeTruthy();
  });

  it("répond 404 JSON pour une route inconnue", async () => {
    const r = await ctx.call("GET", "/nope");
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "not_found" });
  });
});
