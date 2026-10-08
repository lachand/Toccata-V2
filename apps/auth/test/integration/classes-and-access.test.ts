import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, bootstrap, rolesOf, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await bootstrap(); });
afterAll(async () => { await ctx.cleanup(); });

describe("classes et comptes élèves", () => {
  it("crée des élèves avec identifiants lisibles et phrases de passe affichées une seule fois", async () => {
    const t = await ctx.signupTeacher("classes.t1", "fr");
    const { students } = await ctx.makeClass(t.token, ["Lina Aubert", "Hugo Martin", "Lina Aubert"]);
    expect(students.map((s) => s.username)).toEqual(["lina.a", "hugo.m", "lina.a2"]); // les homonymes sont départagés
    for (const s of students) expect(s.passphrase).toMatch(/^[a-z]+(-[a-z]+){5}$/);
    expect(new Set(students.map((s) => s.passphrase)).size).toBe(3);

    // la liste de la classe ne contient jamais de secret
    const k = (await ctx.call("GET", "/classes", { token: t.token })).json[0];
    const detail = await ctx.call("GET", `/classes/${k.id}`, { token: t.token });
    expect(detail.json.students).toHaveLength(3);
    expect(JSON.stringify(detail.json)).not.toMatch(/passphrase|passwordHash/);
  });

  it("l'élève se connecte avec sa phrase de passe, quelle que soit la graphie", async () => {
    const t = await ctx.signupTeacher("classes.t2", "fr");
    const { students: [s] } = await ctx.makeClass(t.token, ["Éloïse Dupré"]);
    expect(s!.username).toBe("eloise.d");
    for (const typed of [s!.passphrase, s!.passphrase.toUpperCase(), s!.passphrase.replace(/-/g, " "), `  ${s!.passphrase}  `]) {
      const r = await ctx.login("eloise.d", typed);
      expect(r.status, typed).toBe(200);
      expect(r.json.user).toMatchObject({ role: "student", displayName: "Éloïse Dupré", locale: "fr" });
    }
    expect((await ctx.login("eloise.d", "un-autre-mot-de-passe")).status).toBe(401);
  });

  it("les phrases de passe suivent la langue de l'enseignant", async () => {
    const t = await ctx.signupTeacher("classes.en", "en");
    const { students } = await ctx.makeClass(t.token, ["Sam Taylor"]);
    const { wordlist } = await import("@scure/bip39/wordlists/english.js");
    for (const w of students[0]!.passphrase.split("-")) expect(wordlist).toContain(w);
    expect((await ctx.login(students[0]!.username, students[0]!.passphrase)).json.user.locale).toBe("en");
  });

  it("un élève ne peut pas utiliser les routes d'enseignant", async () => {
    const t = await ctx.signupTeacher("classes.t3");
    const { students: [s] } = await ctx.makeClass(t.token, ["Nina Roux"]);
    const tok = (await ctx.login(s!.username, s!.passphrase)).json.accessToken;
    expect((await ctx.call("POST", "/classes", { token: tok, body: { name: "x" } })).status).toBe(403);
    expect((await ctx.call("POST", "/activities", { token: tok })).status).toBe(403);
    expect((await ctx.call("GET", "/classes", { token: tok })).status).toBe(403);
  });

  it("un autre enseignant ne voit ni ne modifie la classe (404, sans fuite d'existence)", async () => {
    const a = await ctx.signupTeacher("classes.a");
    const b = await ctx.signupTeacher("classes.b");
    const { classId, students: [s] } = await ctx.makeClass(a.token, ["Zoé Blanc"]);
    expect((await ctx.call("GET", `/classes/${classId}`, { token: b.token })).status).toBe(404);
    expect((await ctx.call("POST", `/classes/${classId}/students`, { token: b.token, body: { names: ["Intrus"] } })).status).toBe(404);
    expect((await ctx.call("POST", `/classes/${classId}/students/${s!.id}/reset-password`, { token: b.token })).status).toBe(404);
    expect((await ctx.call("DELETE", `/classes/${classId}/students/${s!.id}`, { token: b.token })).status).toBe(404);
    expect((await ctx.call("GET", "/classes/n-existe-pas", { token: b.token })).status).toBe(404);
    expect((await ctx.call("GET", "/classes", { token: b.token })).json).toEqual([]);
  });

  it("réinitialise un mot de passe : l'ancien ne marche plus, les sessions sont coupées, le verrouillage levé", async () => {
    const t = await ctx.signupTeacher("classes.reset");
    const { classId, students: [s] } = await ctx.makeClass(t.token, ["Yanis Fort"]);
    const first = await ctx.login(s!.username, s!.passphrase);
    for (let i = 0; i < 5; i++) await ctx.login(s!.username, "faux faux faux faux");
    expect((await ctx.login(s!.username, s!.passphrase)).json.error).toBe("locked");
    const reset = await ctx.call("POST", `/classes/${classId}/students/${s!.id}/reset-password`, { token: t.token });
    expect(reset.status).toBe(200);
    expect(reset.json.passphrase).not.toBe(s!.passphrase);
    expect((await ctx.login(s!.username, s!.passphrase)).status).toBe(401);
    expect((await ctx.login(s!.username, reset.json.passphrase)).status).toBe(200);
    expect((await ctx.refresh(first.cookie!)).status).toBe(401); // l'ancienne session est révoquée
  });

  it("supprime un élève : plus de connexion, plus de session, identifiant libéré", async () => {
    const t = await ctx.signupTeacher("classes.del");
    const { classId, students: [s] } = await ctx.makeClass(t.token, ["Noah Petit"]);
    const sess = await ctx.login(s!.username, s!.passphrase);
    expect((await ctx.call("DELETE", `/classes/${classId}/students/${s!.id}`, { token: t.token })).status).toBe(204);
    expect((await ctx.login(s!.username, s!.passphrase)).status).toBe(401);
    expect((await ctx.refresh(sess.cookie!)).status).toBe(401);
    expect((await ctx.call("GET", "/auth/me", { token: sess.json.accessToken })).status).toBe(401); // le jeton encore valide ne suffit plus
    expect((await ctx.call("GET", `/classes/${classId}`, { token: t.token })).json.students).toEqual([]);
    const again = await ctx.call("POST", `/classes/${classId}/students`, { token: t.token, body: { names: ["Noah Petit"] } });
    expect(again.json.students[0].username).toBe("noah.p");
  });

  it("limite la taille des listes", async () => {
    const t = await ctx.signupTeacher("classes.big");
    const k = (await ctx.call("POST", "/classes", { token: t.token, body: { name: "x" } })).json.id;
    expect((await ctx.call("POST", `/classes/${k}/students`, { token: t.token, body: { names: [] } })).status).toBe(400);
    expect((await ctx.call("POST", `/classes/${k}/students`, { token: t.token, body: { names: Array.from({ length: 61 }, (_, i) => `E${i}`) } })).status).toBe(400);
  });
});

describe("droits CouchDB de bout en bout (jetons émis par le service, vraies bases)", () => {
  it("isole les groupes, protège le contenu, et ne donne rien à un autre enseignant", async () => {
    const a = await ctx.signupTeacher("access.a");
    const b = await ctx.signupTeacher("access.b");
    const { classId, students: [s1, s2] } = await ctx.makeClass(a.token, ["Alice Un", "Bob Deux"]);
    const act = (await ctx.call("POST", "/activities", { token: a.token })).json;
    ctx.track(act.dbName);
    const i1 = (await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: { memberIds: [s1!.id] } })).json;
    const i2 = (await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: { memberIds: [s2!.id] } })).json;
    ctx.track(i1.dbName); ctx.track(i2.dbName);
    expect(classId).toBeTruthy();

    const tok1 = (await ctx.login(s1!.username, s1!.passphrase)).json.accessToken as string;
    const tok2 = (await ctx.login(s2!.username, s2!.passphrase)).json.accessToken as string;
    expect(rolesOf(tok1).sort()).toEqual([`inst:${i1.id}:member`, `master:${act.id}:read`].sort());
    expect(rolesOf(a.token)).toEqual([`owner:${a.id}`, "teacher"]); // un rôle de propriété, un rôle d'enseignant (bibliothèque)

    const [T, S1, S2, B] = [asUser(a.token), asUser(tok1), asUser(tok2), asUser(b.token)];
    const put = (u: typeof T, db: string, id: string, doc: object) => u(`${db}/${id}`, { method: "PUT", body: JSON.stringify(doc) });

    // contenu de l'activité : l'enseignant écrit, les élèves lisent
    expect((await put(T, act.dbName, "step1", { kind: "step", title: "Étape 1" })).status).toBe(201);
    expect((await S1(`${act.dbName}/step1`)).status).toBe(200);
    expect((await S2(`${act.dbName}/step1`)).status).toBe(200);
    expect((await put(S1, act.dbName, "hack", { kind: "step" })).status).toBe(403);

    // chaque élève dans SA base
    expect((await put(S1, i1.dbName, "n1", { authorId: s1!.id, text: "salut" })).status).toBe(201);
    expect((await S1(`${i1.dbName}/n1`)).status).toBe(200);
    expect((await S1(i2.dbName)).status).toBe(403);
    expect((await put(S1, i2.dbName, "x", { authorId: s1!.id })).status).toBe(403);
    expect((await S2(`${i1.dbName}/n1`)).status).toBe(403);

    // pas d'usurpation, pas de modification des documents réservés à l'enseignant
    expect((await put(S1, i1.dbName, "fake", { authorId: s2!.id })).status).toBe(403);
    expect((await put(T, i1.dbName, "fb", { authorId: a.id, teacherOnly: true, text: "bravo" })).status).toBe(201);
    const fb = await (await S1(`${i1.dbName}/fb`)).json() as { _rev: string };
    expect((await put(S1, i1.dbName, "fb", { _rev: fb._rev, authorId: a.id, teacherOnly: true, text: "trafiqué" })).status).toBe(403);

    // l'enseignant propriétaire voit toutes les instances
    expect((await T(`${i1.dbName}/n1`)).status).toBe(200);
    expect((await T(i2.dbName)).status).toBe(200);

    // un autre enseignant n'a accès à rien, ni en lecture ni en écriture
    for (const db of [act.dbName, i1.dbName, i2.dbName]) {
      expect((await B(db)).status, `lecture ${db}`).toBe(403);
      expect((await put(B, db, "intrus", { authorId: b.id })).status, `écriture ${db}`).toBe(403);
    }

    // sans jeton
    expect((await fetch(`${process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984"}/${i1.dbName}`)).status).toBe(401);
  });

  it("un élève ajouté après coup n'obtient l'accès qu'en rafraîchissant son jeton ; retiré, il le perd", async () => {
    const a = await ctx.signupTeacher("access.late");
    const { students: [s] } = await ctx.makeClass(a.token, ["Late Comer"]);
    const act = (await ctx.call("POST", "/activities", { token: a.token })).json;
    const inst = (await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: {} })).json;
    ctx.track(act.dbName); ctx.track(inst.dbName);

    const first = await ctx.login(s!.username, s!.passphrase);
    expect(rolesOf(first.json.accessToken)).toEqual([]);
    expect((await asUser(first.json.accessToken)(inst.dbName)).status).toBe(403);

    expect((await ctx.call("PUT", `/instances/${inst.id}/members`, { token: a.token, body: { memberIds: [s!.id] } })).status).toBe(200);
    expect((await asUser(first.json.accessToken)(inst.dbName)).status).toBe(403); // l'ancien jeton ne sait rien

    const renewed = await ctx.refresh(first.cookie!);
    expect((await asUser(renewed.json.accessToken)(inst.dbName)).status).toBe(200);

    await ctx.call("PUT", `/instances/${inst.id}/members`, { token: a.token, body: { memberIds: [] } });
    const after = await ctx.refresh(renewed.cookie!);
    expect(rolesOf(after.json.accessToken)).toEqual([]);
    expect((await asUser(after.json.accessToken)(inst.dbName)).status).toBe(403);
  });

  it("n'inscrit que des élèves de l'enseignant, et seul le propriétaire gère l'activité", async () => {
    const a = await ctx.signupTeacher("members.a");
    const b = await ctx.signupTeacher("members.b");
    const { students: [mine] } = await ctx.makeClass(a.token, ["Mine One"]);
    const { students: [theirs] } = await ctx.makeClass(b.token, ["Theirs Two"]);
    const act = (await ctx.call("POST", "/activities", { token: a.token })).json;
    ctx.track(act.dbName);
    const bad = await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: { memberIds: [theirs!.id] } });
    expect(bad.status).toBe(400); // l'élève d'un autre enseignant
    expect((await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: { memberIds: [a.id] } })).status).toBe(400); // pas un élève
    expect((await ctx.call("POST", `/activities/${act.id}/instances`, { token: b.token, body: {} })).status).toBe(404); // activité d'un autre
    const ok = await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: { memberIds: [mine!.id, mine!.id] } });
    expect(ok.status).toBe(201);
    ctx.track(ok.json.dbName);
    expect((await ctx.call("PUT", `/instances/${ok.json.id}/members`, { token: b.token, body: { memberIds: [] } })).status).toBe(404);
    expect((await ctx.call("GET", "/activities", { token: a.token })).json).toEqual([{ id: act.id, instances: [{ id: ok.json.id, memberIds: [mine!.id] }] }]);
    expect((await ctx.call("GET", "/activities", { token: b.token })).json).toEqual([]);
  });

  it("un jeton falsifié avec des rôles supplémentaires est refusé par CouchDB", async () => {
    const a = await ctx.signupTeacher("access.forge");
    const act = (await ctx.call("POST", "/activities", { token: a.token })).json;
    ctx.track(act.dbName);
    const [h, p, sig] = a.token.split(".");
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
    payload._couchdb.roles.push("_admin");
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    const r = await asUser(forged)(act.dbName);
    expect([400, 401]).toContain(r.status);
    expect((await asUser(forged)("_all_dbs")).status).not.toBe(200);
  });

  it("la base privée d'un enseignant (notes) n'est lisible ni inscriptible par personne d'autre, élèves compris", async () => {
    const a = await ctx.signupTeacher("access.notes.a");
    const b = await ctx.signupTeacher("access.notes.b");
    const { students: [s1] } = await ctx.makeClass(a.token, ["Alice Notes"]);
    const db = `teacher_${a.id}`;
    ctx.track(db);
    const tok1 = (await ctx.login(s1!.username, s1!.passphrase)).json.accessToken as string;
    const [A, B, S] = [asUser(a.token), asUser(b.token), asUser(tok1)];
    const put = (u: typeof A, id: string, doc: object) => u(`${db}/${id}`, { method: "PUT", body: JSON.stringify(doc) });

    expect(rolesOf(a.token)).toEqual([`owner:${a.id}`, "teacher"]);
    expect((await put(A, "n1", { kind: "tnote", authorId: a.id, body: "à revoir" })).status).toBe(201);
    expect((await A(`${db}/n1`)).status).toBe(200);
    expect((await put(A, "n2", { kind: "tnote", authorId: b.id, body: "usurpation" })).status).toBe(403); // l'auteur doit être le propriétaire

    for (const [who, u] of [["autre enseignant", B], ["élève", S]] as const) {
      expect((await u(db)).status, `lecture (${who})`).toBe(403);
      expect((await u(`${db}/n1`)).status, `document (${who})`).toBe(403);
      expect((await put(u, "intrus", { kind: "tnote", authorId: a.id })).status, `écriture (${who})`).toBe(403);
    }
    // un compte créé avant l'existence de la base la reçoit à la connexion (idempotent)
    expect((await ctx.login("access.notes.a", "Tb9#kLm2-vq8Zr!xW")).status).toBe(200);
    expect((await A(`${db}/n1`)).status).toBe(200);
  });

  it("un élève voit ses inscriptions, mais ne peut ni réécrire la définition de l'instance ni usurper un état de participant", async () => {
    const a = await ctx.signupTeacher("access.inst");
    const { students: [s1, s2] } = await ctx.makeClass(a.token, ["Alice Inst", "Bob Inst"]);
    const act = (await ctx.call("POST", "/activities", { token: a.token })).json;
    ctx.track(act.dbName);
    const inst = (await ctx.call("POST", `/activities/${act.id}/instances`, { token: a.token, body: { memberIds: [s1!.id, s2!.id] } })).json;
    ctx.track(inst.dbName);
    const tok1 = (await ctx.login(s1!.username, s1!.passphrase)).json.accessToken as string;
    const tok2 = (await ctx.login(s2!.username, s2!.passphrase)).json.accessToken as string;

    expect((await ctx.call("GET", "/me/memberships", { token: tok1 })).json).toEqual([{ activityId: act.id, instanceId: inst.id }]);
    expect((await ctx.call("GET", "/me/memberships", { token: a.token })).json).toEqual([]);
    expect((await ctx.call("GET", "/me/memberships")).status).toBe(401);

    const [T, S1, S2] = [asUser(a.token), asUser(tok1), asUser(tok2)];
    const put = (u: typeof T, id: string, doc: object) => u(`${inst.dbName}/${id}`, { method: "PUT", body: JSON.stringify(doc) });
    const def = { kind: "instance", authorId: a.id, masterId: act.id, name: "Groupe", memberIds: [s1!.id, s2!.id], linked: true, overrides: {} };
    expect((await put(T, "def", def)).status).toBe(201);
    // l'élève ne peut ni créer une fausse définition (même signée de son nom), ni modifier ou supprimer la vraie
    expect((await put(S1, "fake", { ...def, authorId: s1!.id, linked: false })).status).toBe(403);
    const rev = ((await (await S1(`${inst.dbName}/def`)).json()) as { _rev: string })._rev;
    expect((await put(S1, "def", { ...def, _rev: rev, name: "Piraté" })).status).toBe(403);
    expect((await S1(`${inst.dbName}/def?rev=${rev}`, { method: "DELETE" })).status).toBe(403);

    // consignes de pilotage et retours : l'enseignant les écrit, l'élève ne peut ni en créer ni en modifier
    const base = { authorId: a.id, teacherOnly: true, stepId: act.id };
    expect((await put(T, "msg", { ...base, kind: "broadcast", mode: "message", body: "Bravo", active: true })).status).toBe(201);
    expect((await put(T, "fb1", { ...base, kind: "feedback", body: "Bien", accepted: true })).status).toBe(201);
    expect((await put(S1, "fake-msg", { kind: "broadcast", authorId: s1!.id, mode: "attention", body: "Piraté", active: true })).status).toBe(403);
    expect((await put(S1, "fake-fb", { kind: "feedback", authorId: s1!.id, stepId: act.id, body: "x", accepted: true })).status).toBe(403);
    const msgRev = ((await (await S1(`${inst.dbName}/msg`)).json()) as { _rev: string })._rev;
    expect((await put(S1, "msg", { ...base, _rev: msgRev, kind: "broadcast", mode: "message", body: "Piraté", active: false })).status).toBe(403);
    expect((await S1(`${inst.dbName}/msg`)).status).toBe(200); // lecture : oui

    // état de participant : à son propre nom seulement
    expect((await put(S2, s1!.id, { kind: "participant", authorId: s2!.id, userId: s1!.id })).status).toBe(403); // place déjà « réservée » à s1
    expect((await put(S1, s1!.id, { kind: "participant", authorId: s1!.id, userId: s1!.id })).status).toBe(201);
    expect((await put(S1, s2!.id, { kind: "participant", authorId: s1!.id, userId: s2!.id })).status).toBe(403);
  });
});
