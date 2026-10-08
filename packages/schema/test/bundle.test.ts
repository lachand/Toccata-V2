import { describe, expect, it } from "vitest";
import { instantiateBundle, parseBundle, toBundle, withoutFiles, type Bundle, type MasterContent } from "../src";
import { genMaster, idFactory, rng } from "./factories";

const r = rng(11);
const ids = idFactory(r);
const master: MasterContent = genMaster(r, ids);
const OWNER = ids();

describe("lot d'échange .toccata", () => {
  it("fait l'aller-retour : export, lecture, instanciation", () => {
    const wire = JSON.parse(JSON.stringify(toBundle(master, 1_700_000_000_000)));
    const parsed = parseBundle(wire);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = instantiateBundle(parsed.bundle, OWNER, 1_700_000_001_000, { id: ids });
    expect(out.activity).toMatchObject({ ownerId: OWNER, title: master.activity.title });
    expect(out.steps).toHaveLength(master.steps.length);
    expect(out.steps.map((s) => s.title).sort()).toEqual(master.steps.map((s) => s.title).sort());
  });

  it("recrée TOUS les identifiants (aucune collision, rien de l'activité source ne survit)", () => {
    const out = instantiateBundle(toBundle(master, 1), OWNER, 2, { id: ids });
    const old = new Set([master.activity.id, ...master.steps.map((s) => s.id), ...master.resources.map((x) => x.id), ...master.apps.map((a) => a.id)]);
    const fresh = [out.activity.id, ...out.steps.map((s) => s.id), ...out.resources.map((x) => x.id), ...out.apps.map((a) => a.id)];
    expect(new Set(fresh).size).toBe(fresh.length);
    expect(fresh.some((i) => old.has(i))).toBe(false);
  });

  it("réécrit les références : portées, blocage par un questionnaire, rattachement à l'activité", () => {
    const out = instantiateBundle(toBundle(master, 1), OWNER, 2, { id: ids });
    const stepIds = new Set(out.steps.map((s) => s.id));
    const appIds = new Set(out.apps.map((a) => a.id));
    for (const s of out.steps) {
      expect(s.activityId).toBe(out.activity.id);
      if (s.blockedByAppId) expect(appIds.has(s.blockedByAppId)).toBe(true);
    }
    for (const x of [...out.resources, ...out.apps]) if (x.scope.type === "step") expect(stepIds.has(x.scope.stepId)).toBe(true);
  });

  it("écarte ce qui pointait vers une étape absente du lot, et retire un blocage sans application", () => {
    const b: Bundle = toBundle(master, 1);
    const step = b.steps[0]!;
    const broken: Bundle = {
      ...b,
      steps: [{ ...step, blockedByAppId: ids() }, ...b.steps.slice(1)],
      resources: [{ ...b.resources.find((x) => x.scope.type === "activity")!, scope: { type: "step", stepId: ids() } }],
      apps: [],
    };
    const out = instantiateBundle(broken, OWNER, 2, { id: ids });
    expect(out.resources).toEqual([]);
    expect(out.steps.every((s) => s.blockedByAppId === null)).toBe(true);
  });

  it("garde la lignée d'une copie (forkedFrom) et accepte un autre titre", () => {
    const out = instantiateBundle(toBundle(master, 1), OWNER, 2, { id: ids, forkedFrom: master.activity.id, title: "Copie de l'atelier" });
    expect(out.activity).toMatchObject({ forkedFrom: master.activity.id, title: "Copie de l'atelier" });
  });

  it("impose l'identifiant de l'activité quand le serveur l'a déjà réservé", () => {
    const reserved = ids();
    const out = instantiateBundle(toBundle(master, 1), OWNER, 2, { id: ids, activityId: reserved });
    expect(out.activity.id).toBe(reserved);
    expect(out.steps.every((s) => s.activityId === reserved)).toBe(true);
  });

  it("liste les fichiers à fournir, sans doublon", () => {
    const hash = `file_${"a".repeat(64)}`;
    const b = toBundle(master, 1);
    const withFile: Bundle = { ...b, resources: [...b.resources, ...[1, 2].map(() => ({ ...b.resources[0]!, id: ids(), scope: { type: "activity" as const }, source: { type: "file" as const, fileId: hash, mime: "image/png", size: 3 } }))] };
    expect(instantiateBundle(withFile, OWNER, 2, { id: ids }).fileIds).toEqual([hash]);
    expect(withoutFiles(withFile).resources.every((x) => x.source.type !== "file")).toBe(true);
  });

  it.each([
    ["autre format", { format: "word", version: 1 }, "not_toccata"],
    ["pas un objet", "texte", "not_toccata"],
    ["version inconnue", { format: "toccata", version: 99 }, "unsupported_version"],
    ["contenu invalide", { format: "toccata", version: 1, exportedAt: 1, activity: { title: "x", description: "" }, steps: "non", resources: [], apps: [] }, "invalid"],
  ])("refuse : %s", (_n, raw, reason) => {
    expect(parseBundle(raw)).toEqual({ ok: false, reason });
  });

  it("refuse une adresse non https dans un lot (javascript:, http:)", () => {
    const b = toBundle(master, 1);
    const evil = JSON.parse(JSON.stringify(b));
    evil.resources = [{ ...b.resources[0], source: { type: "url", url: "javascript:alert(1)", display: "iframe" } }];
    expect(parseBundle(evil)).toEqual({ ok: false, reason: "invalid" });
    evil.resources[0].source.url = "http://example.org";
    expect(parseBundle(evil)).toEqual({ ok: false, reason: "invalid" });
  });
});
