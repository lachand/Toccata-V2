import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, bootstrap, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => {
  ctx = await bootstrap();
  await new (await import("../../src/provisioning")).Provisioner(ctx.couch).provisionLibrary();
});
afterAll(async () => {
  await ctx.cleanup();
});

describe("bibliothèque de modèles partagés", () => {
  it("les enseignants lisent et publient ; seul l'auteur modifie ou retire ; ni élèves ni anonymes", async () => {
    const a = await ctx.signupTeacher("lib.a");
    const b = await ctx.signupTeacher("lib.b");
    const { students: [s1] } = await ctx.makeClass(a.token, ["Alice Lib"]);
    const tokS = (await ctx.login(s1!.username, s1!.passphrase)).json.accessToken as string;
    const [A, B, S] = [asUser(a.token), asUser(b.token), asUser(tokS)];
    const id = `tpl${Date.now().toString(36)}`;
    const tpl = (authorId: string, extra: object = {}) => JSON.stringify({ kind: "template", authorId, title: "Atelier", ...extra });

    expect((await A(`library/${id}`, { method: "PUT", body: tpl(a.id) })).status).toBe(201);
    // tout enseignant le lit, pas l'élève, pas un anonyme
    expect((await B(`library/${id}`)).status).toBe(200);
    expect((await S(`library/${id}`)).status).toBe(403);
    expect((await fetch(`${process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984"}/library/${id}`)).status).toBe(401);

    const rev = ((await (await B(`library/${id}`)).json()) as { _rev: string })._rev;
    // un autre enseignant ne peut ni le modifier ni le supprimer, ni publier sous le nom d'un autre
    expect((await B(`library/${id}`, { method: "PUT", body: tpl(a.id, { _rev: rev, title: "Piraté" }) })).status).toBe(403);
    expect((await B(`library/${id}?rev=${rev}`, { method: "DELETE" })).status).toBe(403);
    expect((await B(`library/${id}-faux`, { method: "PUT", body: tpl(a.id) })).status).toBe(403);
    // un élève ne peut rien publier
    expect((await S(`library/${id}-eleve`, { method: "PUT", body: tpl(s1!.id) })).status).toBe(403);
    // seuls les modèles sont acceptés, et leur taille est bornée
    expect((await A(`library/${id}-x`, { method: "PUT", body: JSON.stringify({ kind: "autre", authorId: a.id }) })).status).toBe(403);
    expect((await A(`library/${id}-gros`, { method: "PUT", body: tpl(a.id, { blob: "x".repeat(1_100_000) }) })).status).toBe(403);

    // l'auteur modifie puis retire
    expect((await A(`library/${id}`, { method: "PUT", body: tpl(a.id, { _rev: rev, title: "Atelier v2" }) })).status).toBe(201);
    const rev2 = ((await (await A(`library/${id}`)).json()) as { _rev: string })._rev;
    expect((await A(`library/${id}?rev=${rev2}`, { method: "DELETE" })).status).toBe(200);
  });
});
