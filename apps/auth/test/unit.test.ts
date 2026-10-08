import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { baseUsername, foldPassphrase, generatePassphrase, PASSPHRASE_BITS } from "../src/passphrase";
import { LoginGuard } from "../src/loginguard";
import { hashPassword, passwordProblem, verifyPassword } from "../src/passwords";
import { RateLimiter } from "../src/ratelimit";
import { rolesFor } from "../src/roles";
import { hashSecret, ISSUER, mintAccessToken, newRefreshSecret, secretMatches, verifyAccessToken } from "../src/tokens";
import { instanceValidator, masterValidator } from "../src/vdu";

const SECRET = Buffer.from("dev-only-secret-change-me-32-bytes!!");
const cfg = { JWT_SECRET: SECRET, JWT_KID: "dev", ACCESS_TTL_SECONDS: 900 };
const ID_A = "01hg0ab2677d2tj36h5hk4";
const ID_B = "01hg0ab2677d2tj36h5hk5";
const INST = "01hg0ab2677d2tj36h5hk6";

describe("configuration", () => {
  const ok = { COUCHDB_URL: "http://localhost:5984", COUCHDB_ADMIN_USER: "a", COUCHDB_ADMIN_PASSWORD: "b", JWT_SECRET: SECRET.toString("base64") };
  it("accepte une configuration minimale et applique les valeurs par défaut sûres", () => {
    const c = loadConfig(ok);
    expect(c.COOKIE_SECURE).toBe(true);
    expect(c.TRUST_PROXY).toBe(false);
    expect(c.BASE_PATH).toBe("/api");
    expect(c.OPEN_SIGNUP).toBe(false); // inscription fermée par défaut
    expect(c.ACCESS_TTL_SECONDS).toBe(900);
    expect(c.JWT_SECRET.byteLength).toBeGreaterThanOrEqual(32);
  });
  it("traite une variable vide (docker compose `VAR=`) comme absente", () => {
    const c = loadConfig({ ...ok, SIGNUP_CODE: "", UPSTREAM_COUCHDB_URL: "", TEACHER_IDS: "", SERVER_NAME: "" });
    expect(c.SIGNUP_CODE).toBeUndefined();
    expect(c.SERVER_NAME).toBe("Toccata");
    expect(() => loadConfig({ ...ok, JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
  });
  it("refuse de démarrer sans secret, sans afficher de valeur", () => {
    const { JWT_SECRET: _omit, ...sans } = ok;
    expect(() => loadConfig(sans)).toThrow(/JWT_SECRET/);
  });
  it("refuse un secret trop court", () => {
    const short = Buffer.from("trop-court").toString("base64");
    let msg = "";
    try { loadConfig({ ...ok, JWT_SECRET: short }); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/32 octets/);
    expect(msg).not.toContain(short); // le message ne répète jamais la valeur
  });
  it("refuse un préfixe d'API invalide", () => {
    for (const bad of ["api", "/", "/a b", "/../x", "//x"]) expect(() => loadConfig({ ...ok, BASE_PATH: bad }), bad).toThrow();
    expect(loadConfig({ ...ok, BASE_PATH: "/v1/api" }).BASE_PATH).toBe("/v1/api");
  });
  it("borne la durée du jeton d'accès", () => {
    expect(() => loadConfig({ ...ok, ACCESS_TTL_SECONDS: "86400" })).toThrow();
  });
  it("refuse une valeur booléenne ambiguë", () => {
    expect(() => loadConfig({ ...ok, COOKIE_SECURE: "yes" })).toThrow();
  });
});

describe("mots de passe", () => {
  it("hache en Argon2id avec les paramètres OWASP, avec un sel différent à chaque fois", async () => {
    const [a, b] = [await hashPassword("un-mot-de-passe-long"), await hashPassword("un-mot-de-passe-long")];
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("un-mot-de-passe-long");
  });
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "correct horse batterY")).toBe(false);
    expect(await verifyPassword(h, "")).toBe(false);
  });
  it("renvoie faux (et fait le travail) pour un compte inconnu ou un haché illisible", async () => {
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword("pas-un-hache", "x")).toBe(false);
  });
  it("applique la politique des mots de passe d'enseignant", () => {
    expect(passwordProblem("court", "marie")).toBe("too_short");
    expect(passwordProblem("aaaaaaaaaaaaaaaa", "marie")).toBe("too_simple");
    expect(passwordProblem("xx-marie-durand-xx", "marie")).toBe("contains_username");
    expect(passwordProblem("une phrase assez longue", "marie")).toBeNull();
    // mots de passe courants : refusés même s'ils ont 12 caractères ou plus (attaque « horizontale »)
    for (const weak of ["azertyuiop123", "Bonjour123456", "lundi mardi mercredi jeudi", "123456789012", "passwordpassword", "motdepasse2024!!", "Azerty123456!"]) expect(passwordProblem(weak, "marie"), weak).toBe("too_common");
    expect(passwordProblem("Marie2024-Durand!", "zoe", ["Marie Durand"])).toBe("contains_username"); // bâti sur le nom affiché
    expect(passwordProblem("xx-DÉBORAH-xx-2024-q", "zoe", ["Déborah Lenoir"])).toBe("contains_username"); // accents et casse ignorés
    expect(passwordProblem("Tb9#kLm2-vq8Zr!xW", "marie")).toBeNull();
    expect(passwordProblem("😀😁😂😃😄😅😆😇😈😉😊😋", "x")).toBeNull(); // 12 caractères (points de code), pas 12 octets
    expect(passwordProblem("😀😁😂😃😄", "x")).toBe("too_short");
  });
});

describe("phrases de passe et identifiants élèves", () => {
  it("tire 6 mots de la liste de la langue demandée", () => {
    for (const lang of ["fr", "en"] as const) {
      const p = generatePassphrase(lang);
      expect(p.split("-")).toHaveLength(6);
      expect(p).toMatch(/^[a-z]+(-[a-z]+){5}$/); // ASCII : rien de plus facile à taper sur une tablette
    }
    expect(PASSPHRASE_BITS()).toBe(66); // 4 mots ne donnaient que 44 bits
  });
  it("accepte à la saisie toute graphie : accents, majuscules, espaces", () => {
    expect(foldPassphrase("Sucre-Mutuel-Débattre-Viande")).toBe("sucre-mutuel-debattre-viande");
    expect(foldPassphrase("  sucre mutuel debattre   viande ")).toBe("sucre-mutuel-debattre-viande");
    expect(foldPassphrase("sucre_mutuel.debattre-viande")).toBe("sucre-mutuel-debattre-viande");
    expect(foldPassphrase("De\u0301battre")).toBe(foldPassphrase("Débattre")); // décomposé = composé
  });
  it("les 2048 mots restent distincts une fois les accents retirés (l'entropie ne baisse pas)", async () => {
    const { wordlist: fr } = await import("@scure/bip39/wordlists/french.js");
    const { wordlist: en } = await import("@scure/bip39/wordlists/english.js");
    for (const list of [fr, en]) expect(new Set(list.map((w) => foldPassphrase(w))).size).toBe(2048);
  });
  it("ne répète pas : 5 000 phrases toutes différentes", () => {
    expect(new Set(Array.from({ length: 5000 }, () => generatePassphrase("fr"))).size).toBe(5000);
  });
  it("n'introduit AUCUN biais de modulo : 65 536 est un multiple exact de 2 048, chaque mot a la même probabilité", () => {
    // On rejoue chaque valeur possible de 16 bits comme « tirage » : chaque mot doit sortir exactement 32 fois.
    const counts = new Map<string, number>();
    for (let v = 0; v < 65_536; v++) {
      const word = generatePassphrase("en", () => Uint8Array.from([v >> 8, v & 255]), 1);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    expect(counts.size).toBe(2048);
    expect(new Set(counts.values())).toEqual(new Set([32]));
  });
  it("utilise tous les mots de la liste de façon à peu près uniforme (pas de biais de modulo)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) for (const w of generatePassphrase("en", undefined, 20).split("-")) counts.set(w, (counts.get(w) ?? 0) + 1);
    expect(counts.size).toBeGreaterThan(2000); // sur 80 000 tirages, presque tous les 2048 mots apparaissent
    expect(Math.max(...counts.values())).toBeLessThan(90); // moyenne ≈ 39
  });
  it("dérive un identifiant lisible du nom", () => {
    expect(baseUsername("Lina Aubert")).toBe("lina.a");
    expect(baseUsername("Élodie")).toBe("elodie");
    expect(baseUsername("Jean-Pierre de la Tour")).toBe("jean.t");
    expect(baseUsername("   ")).toBe("eleve");
    expect(baseUsername("😀")).toBe("eleve");
    expect(baseUsername("A".repeat(60))).toHaveLength(20);
  });
});

describe("jetons d'accès", () => {
  const claims = { sub: ID_A, role: "student" as const, couchRoles: [`inst:${INST}:member`] };
  it("contient la claim CouchDB imbriquée, un émetteur, une courte durée et un kid", async () => {
    const t = await mintAccessToken(cfg, claims, 1_700_000_000_000);
    const [h, p] = t.split(".").slice(0, 2).map((x) => JSON.parse(Buffer.from(x!, "base64url").toString())) as [Record<string, unknown>, Record<string, any>];
    expect(h).toMatchObject({ alg: "HS256", kid: "dev" });
    expect(p["_couchdb"]).toEqual({ roles: [`inst:${INST}:member`] });
    expect(p["iss"]).toBe(ISSUER);
    expect(p["exp"] - p["iat"]).toBe(900);
  });
  it("se vérifie, expire, et refuse falsification, mauvaise clé, mauvais émetteur et alg none", async () => {
    const now = 1_700_000_000_000;
    const t = await mintAccessToken(cfg, claims, now);
    expect(await verifyAccessToken(cfg, t, now + 1000)).toEqual(claims);
    expect(await verifyAccessToken(cfg, t, now + 901_000)).toBeNull();
    const [h, p, s] = t.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), role: "teacher" })).toString("base64url")}.${s}`;
    expect(await verifyAccessToken(cfg, forged, now)).toBeNull();
    expect(await verifyAccessToken({ JWT_SECRET: Buffer.alloc(32, 7) }, t, now)).toBeNull();
    const other = await new SignJWT({ role: "student", _couchdb: { roles: [] } }).setProtectedHeader({ alg: "HS256" }).setSubject(ID_A).setIssuer("autre").setExpirationTime("15m").sign(SECRET);
    expect(await verifyAccessToken(cfg, other)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: ID_A, iss: ISSUER, exp: 9_999_999_999, role: "teacher", _couchdb: { roles: [] } })).toString("base64url")}.`;
    expect(await verifyAccessToken(cfg, none)).toBeNull();
    expect(await verifyAccessToken(cfg, "n'importe quoi")).toBeNull();
  });
  it("refuse un jeton sans rôle valide", async () => {
    const bad = await new SignJWT({ role: "admin", _couchdb: { roles: ["_admin"] } }).setProtectedHeader({ alg: "HS256" }).setSubject(ID_A).setIssuer(ISSUER).setExpirationTime("15m").sign(SECRET);
    expect(await verifyAccessToken(cfg, bad)).toBeNull();
  });
});

describe("jetons de rafraîchissement", () => {
  it("font 256 bits, ne sont stockés que hachés, et se comparent à temps constant", () => {
    const s = newRefreshSecret();
    expect(Buffer.from(s, "base64url")).toHaveLength(32);
    expect(newRefreshSecret()).not.toBe(s);
    expect(hashSecret(s)).not.toContain(s);
    expect(secretMatches(s, hashSecret(s))).toBe(true);
    expect(secretMatches(s + "x", hashSecret(s))).toBe(false);
    expect(secretMatches(s, "court")).toBe(false);
  });
});

describe("rôles CouchDB", () => {
  it("l'enseignant n'a qu'un rôle, quel que soit son nombre d'activités", () => {
    expect(rolesFor({ id: ID_A, role: "teacher" })).toEqual([`owner:${ID_A}`, "teacher"]);
  });
  it("l'élève a uniquement ses instances et leurs activités, sans doublon", () => {
    const m = [{ activityId: ID_B, instanceId: INST }, { activityId: ID_B, instanceId: ID_A }];
    expect(rolesFor({ id: ID_A, role: "student", memberships: m })).toEqual([`inst:${ID_A}:member`, `inst:${INST}:member`, `master:${ID_B}:read`]);
    expect(rolesFor({ id: ID_A, role: "student" })).toEqual([]);
  });
  it("un jeton d'enseignant reste minuscule (le schéma « un rôle par instance » en faisait 30 Ko)", async () => {
    const t = await mintAccessToken(cfg, { sub: ID_A, role: "teacher", couchRoles: rolesFor({ id: ID_A, role: "teacher" }) });
    expect(t.length).toBeLessThan(500);
  });
});

describe("validate_doc_update générés", () => {
  const compile = (src: string) => new Function(`return (${src});`)() as (n: any, o: any, u: any, s: any) => void;
  const run = (fn: ReturnType<typeof compile>, n: any, o: any, roles: string[], name = "u") => {
    try { fn(n, o, { name, roles }, {}); return "ok"; } catch (e) { return (e as { forbidden?: string }).forbidden ?? "erreur"; }
  };

  it("master : seuls les propriétaires écrivent", () => {
    const v = compile(masterValidator([ID_A, ID_B]));
    expect(run(v, { _id: "x" }, null, [`owner:${ID_A}`])).toBe("ok");
    expect(run(v, { _id: "x" }, null, [`owner:${ID_B}`])).toBe("ok");
    expect(run(v, { _id: "x" }, null, [`master:${INST}:read`])).toBe("read_only");
    expect(run(v, { _id: "x" }, null, [`owner:${INST}`])).toBe("read_only"); // le propriétaire d'une autre activité
    expect(run(v, { _id: "x" }, null, [])).toBe("read_only");
    expect(run(v, { _id: "x" }, null, ["_admin"])).toBe("ok");
  });

  it("instance : isolation, authorId et documents réservés", () => {
    const v = compile(instanceValidator(INST, [ID_A]));
    const member = [`inst:${INST}:member`];
    expect(run(v, { _id: "n", authorId: "u" }, null, member)).toBe("ok");
    expect(run(v, { _id: "n", authorId: "autre" }, null, member)).toBe("author_mismatch");
    expect(run(v, { _id: "n", authorId: "autre" }, { authorId: "u" }, member)).toBe("author_immutable");
    expect(run(v, { _id: "n", authorId: "u", teacherOnly: true }, null, member)).toBe("teacher_only");
    expect(run(v, { _id: "n", _deleted: true }, { authorId: "u", teacherOnly: true }, member)).toBe("teacher_only");
    expect(run(v, { _id: "n", authorId: "u" }, null, [`inst:${ID_B}:member`])).toBe("access_denied");
    expect(run(v, { _id: "n", authorId: "x", teacherOnly: true }, null, [`owner:${ID_A}`])).toBe("ok");
    expect(run(v, { _id: "n", authorId: "u" }, null, [`owner:${ID_B}`])).toBe("access_denied");
  });

  it("refuse tout identifiant qui ne soit pas un identifiant Toccata (pas d'injection de code)", () => {
    expect(() => masterValidator(['"]; throw 1; //'])).toThrow(RangeError);
    expect(() => instanceValidator("x'); evil(); //", [ID_A])).toThrow(RangeError);
    expect(() => masterValidator([])).toThrow(RangeError);
  });
});

describe("limiteur de débit", () => {
  it("bloque au-delà du maximum dans la fenêtre puis libère", () => {
    let t = 0;
    const l = new RateLimiter(3, 1000, () => t);
    expect([l.hit("a"), l.hit("a"), l.hit("a")]).toEqual([0, 0, 0]);
    expect(l.hit("a")).toBe(1000);
    t = 400;
    expect(l.hit("a")).toBe(600);
    expect(l.hit("b")).toBe(0); // clés indépendantes
    t = 1001;
    expect(l.hit("a")).toBe(0);
  });
  it("reset libère une clé", () => {
    const l = new RateLimiter(1, 10_000);
    l.hit("k");
    expect(l.hit("k")).toBeGreaterThan(0);
    l.reset("k");
    expect(l.hit("k")).toBe(0);
  });
});

describe("garde de connexion (4 axes)", () => {
  const rate = (f: () => void) => { try { f(); return "ok"; } catch (e) { return (e as { code?: string }).code ?? "erreur"; } };
  let t = 1_000_000;
  const guard = (o = {}) => new LoginGuard({ now: () => t, ...o });

  it("laisse toute une classe derrière la même adresse se connecter en même temps (les succès ne comptent pas)", () => {
    t = 1_000_000;
    const g = guard();
    for (let i = 0; i < 100; i++) {
      const user = `eleve${i}`;
      expect(rate(() => g.check("10.0.0.1", user)), user).toBe("ok");
      g.recordSuccess("10.0.0.1", user);
    }
  });

  it("une classe où chacun se trompe une fois de frappe ne se bloque pas non plus", () => {
    t = 1_000_000;
    const g = guard();
    for (let i = 0; i < 30; i++) {
      expect(rate(() => g.check("10.0.0.1", `eleve${i}`))).toBe("ok");
      g.recordFailure("10.0.0.1", `eleve${i}`);
    }
    expect(rate(() => g.check("10.0.0.1", "eleve0"))).toBe("ok"); // chacun peut réessayer
  });

  it("attaque horizontale : un même mot de passe essayé sur des dizaines d'identifiants depuis une adresse est stoppé", () => {
    t = 1_000_000;
    const g = guard();
    let blockedAt = -1;
    for (let i = 0; i < 200; i++) {
      if (rate(() => g.check("203.0.113.9", `victime${i}`)) !== "ok") { blockedAt = i; break; }
      g.recordFailure("203.0.113.9", `victime${i}`);
    }
    expect(blockedAt).toBe(40); // le 41e identifiant distinct est refusé
    expect(rate(() => g.check("203.0.113.9", "victime0"))).toBe("ok"); // un compte déjà vu peut encore réessayer
    expect(rate(() => g.check("198.51.100.2", "victime41"))).toBe("ok"); // une autre adresse n'est pas touchée
  });

  it("attaque verticale : trop d'échecs depuis une adresse la bloquent, puis elle est libérée", () => {
    t = 1_000_000;
    const g = guard({ ipDistinct: 1000 });
    const targets = ["cible1", "cible2", "cible3"]; // 3 comptes × 20 essais : sous le plafond par identifiant, au plafond de l'adresse
    for (let i = 0; i < 60; i++) { const u = targets[i % 3]!; expect(rate(() => g.check("203.0.113.9", u)), `essai ${i}`).toBe("ok"); g.recordFailure("203.0.113.9", u); t += 100; }
    expect(rate(() => g.check("203.0.113.9", "cible1"))).toBe("rate_limited"); // 61e échec refusé : plafond de l'adresse
    expect(rate(() => g.check("198.51.100.5", "autre.compte"))).toBe("ok");
    t += 16 * 60_000;
    expect(rate(() => g.check("203.0.113.9", "cible1"))).toBe("ok"); // fenêtre écoulée : libérée
  });

  it("limite les tentatives sur un même identifiant venant d'adresses différentes", () => {
    t = 1_000_000;
    const g = guard({ userAttempts: 5 });
    const codes = Array.from({ length: 8 }, (_, i) => rate(() => g.check(`198.51.100.${i}`, "compte.vise")));
    expect(codes).toEqual(["ok", "ok", "ok", "ok", "ok", "rate_limited", "rate_limited", "rate_limited"]);
  });

  it("renvoie un délai d'attente exploitable", () => {
    t = 1_000_000;
    const g = guard({ userAttempts: 1 });
    g.check("1.1.1.1", "a");
    try { g.check("1.1.1.1", "a"); } catch (e) { expect((e as { details: { retryAfterSeconds: number } }).details.retryAfterSeconds).toBeGreaterThan(0); return; }
    throw new Error("devait lever");
  });

  it("force brute distribuée : le seuil global déclenche le mode « sous attaque » qui resserre les seuils par adresse, puis le lève", () => {
    t = 1_000_000;
    const alerts: number[] = [];
    const g = guard({ globalFailuresPerMinute: 50, onAttack: (i: { failuresPerMinute: number }) => alerts.push(i.failuresPerMinute) });
    // 50 échecs en une minute depuis 50 adresses différentes, sans qu'aucune ne dépasse les seuils normaux
    for (let i = 0; i < 50; i++) { g.check(`192.0.2.${i}`, `u${i}`); g.recordFailure(`192.0.2.${i}`, `u${i}`); t += 500; }
    expect(g.underAttack).toBe(true);
    expect(alerts).toEqual([50]); // alerte émise une seule fois
    // sous attaque, une adresse qui a déjà 10 échecs est refusée (au lieu de 60) ...
    const ip = "198.51.100.77";
    for (let i = 0; i < 10; i++) { g.check(ip, `c${i % 5}`); g.recordFailure(ip, `c${i % 5}`); }
    expect(rate(() => g.check(ip, "c0"))).toBe("rate_limited");
    // ... mais un visiteur sans échec récent continue de se connecter : le service n'est pas coupé
    expect(rate(() => g.check("203.0.113.200", "eleve.normal"))).toBe("ok");
    t += 11 * 60_000;
    expect(g.underAttack).toBe(false);
    expect(rate(() => g.check(ip, "c0"))).toBe("ok");
  });
});
