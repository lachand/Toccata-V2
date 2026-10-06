import { describe, expect, it } from "vitest";
import { applyToMaster, applyToOverrides, emptyOverrides, isShadowed, planEdit, resolve, unlinkInstance, type Edit, type MasterContent } from "../src";
import { deepFreeze, idFactory, makeInstance, makeKanban, makeResource, makeStep, makeTimer, rng } from "./factories";

const ids = idFactory(rng(42));
const act = ids();
const owner = ids();
const [s1, s2, s3] = [ids(), ids(), ids()] as const;
const res1 = ids();
const resAct = ids();
const timer = ids();
const kanban = ids();

const master: MasterContent = deepFreeze({
  activity: { id: act, kind: "activity", ownerId: owner, title: "Atelier", description: "", createdAt: 1, updatedAt: 1 },
  steps: [makeStep(s1, act, "a0"), makeStep(s2, act, "a1"), makeStep(s3, act, "a2")],
  resources: [makeResource(res1, { type: "step", stepId: s1 }), makeResource(resAct, { type: "activity" })],
  apps: [makeTimer(timer, { type: "step", stepId: s2 }, 180), makeKanban(kanban, { type: "activity" })],
});

const corail = makeInstance(ids(), act, owner, { name: "Corail" });
const menthe = makeInstance(ids(), act, owner, { name: "Menthe" });
const safran = makeInstance(ids(), act, owner, { name: "Safran", linked: false, snapshot: master });
const ardoise = makeInstance(ids(), act, owner, { name: "Ardoise", overrides: { ...emptyOverrides(), steps: { [s3]: { hidden: false } } } });
const all = [corail, menthe, safran, ardoise];

const hide3: Edit = { type: "setStepHidden", stepId: s3, hidden: true };

describe("planEdit", () => {
  it("cible « toute la classe » : une écriture master, et on prévient qui ne la recevra pas", () => {
    const plan = planEdit(hide3, { type: "all" }, all);
    expect(plan.writes).toEqual([{ scope: "master", edit: hide3 }]);
    expect(plan.unreached).toEqual([safran.id]); // déliée
    expect(plan.shadowed).toEqual([ardoise.id]); // a déjà sa propre valeur de « hidden » pour cette étape
    expect(plan.unknown).toEqual([]);
  });

  it("cible des instances précises : une surcharge par instance, rien sur le master", () => {
    const plan = planEdit(hide3, { type: "instances", instanceIds: [corail.id, menthe.id] }, all);
    expect(plan.writes).toEqual([
      { scope: "instance", instanceId: corail.id, edit: hide3 },
      { scope: "instance", instanceId: menthe.id, edit: hide3 },
    ]);
    expect(plan.writes.some((w) => w.scope === "master")).toBe(false);
  });

  it("dédoublonne les cibles et signale les identifiants inconnus", () => {
    const stranger = ids();
    const plan = planEdit(hide3, { type: "instances", instanceIds: [corail.id, corail.id, stranger] }, all);
    expect(plan.writes).toHaveLength(1);
    expect(plan.unknown).toEqual([stranger]);
  });

  it("une instance déliée peut quand même être ciblée explicitement", () => {
    const plan = planEdit(hide3, { type: "instances", instanceIds: [safran.id] }, all);
    expect(plan.writes).toEqual([{ scope: "instance", instanceId: safran.id, edit: hide3 }]);
  });

  it("scénario : masquer l'étape 3 pour deux groupes seulement", () => {
    const plan = planEdit(hide3, { type: "instances", instanceIds: [corail.id, menthe.id] }, all);
    const updated = all.map((i) => {
      const w = plan.writes.find((x) => x.scope === "instance" && x.instanceId === i.id);
      return w ? { ...i, overrides: applyToOverrides(i.overrides, w.edit, master) } : i;
    });
    const seen = Object.fromEntries(updated.map((i) => [i.name, resolve(master, i, { role: "student" }).steps.map((s) => s.id)]));
    expect(seen["Corail"]).toEqual([s1, s2]);
    expect(seen["Menthe"]).toEqual([s1, s2]);
    expect(seen["Ardoise"]).toEqual([s1, s2, s3]); // personne d'autre n'est touché (s3 est visible chez Ardoise : sa surcharge)
    expect(seen["Safran"]).toEqual([s1, s2, s3]);
  });
});

describe("isShadowed", () => {
  it("ne signale que les champs réellement surchargés", () => {
    expect(isShadowed(hide3, ardoise)).toBe(true);
    expect(isShadowed({ type: "setStepHidden", stepId: s1, hidden: true }, ardoise)).toBe(false);
    expect(isShadowed({ type: "setStepLocked", stepId: s3, locked: true }, ardoise)).toBe(false);
    const withTitle = { ...corail, overrides: { ...emptyOverrides(), steps: { [s1]: { title: "Perso" } } } };
    expect(isShadowed({ type: "patchStep", stepId: s1, patch: { title: "Neuf" } }, withTitle)).toBe(true);
    expect(isShadowed({ type: "patchStep", stepId: s1, patch: { instructions: "Neuf" } }, withTitle)).toBe(false);
    const withCfg = { ...corail, overrides: { ...emptyOverrides(), apps: { extra: [], hidden: [], config: { [timer]: { durationSec: 60 } } } } };
    expect(isShadowed({ type: "patchAppConfig", appId: timer, config: { durationSec: 90 } }, withCfg)).toBe(true);
    expect(isShadowed({ type: "addApp", app: makeTimer(ids(), { type: "activity" }) }, withCfg)).toBe(false);
  });
});

describe("applyToMaster", () => {
  it("modifie sans muter l'entrée", () => {
    const m = applyToMaster(master, { type: "patchStep", stepId: s1, patch: { title: "Neuf" } });
    expect(m.steps[0]!.title).toBe("Neuf");
    expect(master.steps[0]!.title).not.toBe("Neuf");
  });
  it("supprimer une étape supprime ses ressources et apps propres, pas celles de l'activité", () => {
    const m = applyToMaster(master, { type: "removeStep", stepId: s2 });
    expect(m.steps.map((s) => s.id)).toEqual([s1, s3]);
    expect(m.apps.map((a) => a.id)).toEqual([kanban]);
    expect(m.resources.map((r) => r.id)).toEqual([res1, resAct]);
  });
  it("ajouter deux fois le même identifiant remplace au lieu de dupliquer", () => {
    const again = makeStep(s1, act, "a9", { title: "Remplacée" });
    const m = applyToMaster(applyToMaster(master, { type: "addStep", step: again }), { type: "addStep", step: again });
    expect(m.steps.filter((s) => s.id === s1)).toHaveLength(1);
    expect(m.steps.find((s) => s.id === s1)!.title).toBe("Remplacée");
  });
  it("ignore une cible inconnue (idempotent)", () => {
    const unknown = ids();
    for (const e of [{ type: "setStepHidden", stepId: unknown, hidden: true }, { type: "removeResource", resourceId: unknown }, { type: "removeApp", appId: unknown }] as const) {
      expect(applyToMaster(master, e)).toEqual(master);
    }
  });
  it("ignore une config d'app invalide", () => {
    const m = applyToMaster(master, { type: "patchAppConfig", appId: timer, config: { durationSec: -3 } });
    expect(m.apps.find((a) => a.id === timer)).toMatchObject({ config: { durationSec: 180 } });
    const ok = applyToMaster(master, { type: "patchAppConfig", appId: timer, config: { durationSec: 240 } });
    expect(ok.apps.find((a) => a.id === timer)).toMatchObject({ config: { durationSec: 240 } });
  });
});

describe("applyToOverrides", () => {
  const base = master;
  it("fusionne les surcharges d'une même étape sans effacer les autres champs", () => {
    let o = applyToOverrides(emptyOverrides(), { type: "setStepHidden", stepId: s1, hidden: true }, base);
    o = applyToOverrides(o, { type: "patchStep", stepId: s1, patch: { title: "Perso" } }, base);
    expect(o.steps[s1]).toEqual({ hidden: true, title: "Perso" });
  });
  it("un champ non renseigné (undefined) n'efface pas une surcharge existante", () => {
    let o = applyToOverrides(emptyOverrides(), { type: "patchStep", stepId: s1, patch: { title: "Perso" } }, base);
    o = applyToOverrides(o, { type: "patchStep", stepId: s1, patch: { instructions: "Consigne" } }, base);
    expect(o.steps[s1]).toEqual({ title: "Perso", instructions: "Consigne" });
    const o2 = applyToOverrides(o, { type: "patchStep", stepId: s1, patch: { title: undefined } }, base);
    expect(o2.steps[s1]!.title).toBe("Perso");
  });
  it("retirer une ressource héritée la masque ; retirer une ressource propre la supprime", () => {
    const o1 = applyToOverrides(emptyOverrides(), { type: "removeResource", resourceId: res1 }, base);
    expect(o1.resources.hidden).toEqual([res1]);
    const mine = makeResource(ids(), { type: "activity" });
    let o2 = applyToOverrides(emptyOverrides(), { type: "addResource", resource: mine }, base);
    o2 = applyToOverrides(o2, { type: "removeResource", resourceId: mine.id }, base);
    expect(o2.resources).toEqual({ extra: [], hidden: [] });
  });
  it("retirer deux fois ne duplique pas, et ré-ajouter démasque", () => {
    let o = applyToOverrides(emptyOverrides(), { type: "removeResource", resourceId: res1 }, base);
    o = applyToOverrides(o, { type: "removeResource", resourceId: res1 }, base);
    expect(o.resources.hidden).toEqual([res1]);
    o = applyToOverrides(o, { type: "addResource", resource: base.resources[0]! }, base);
    expect(o.resources.hidden).toEqual([]);
  });
  it("retirer une étape héritée la masque ; retirer une étape propre la supprime avec ses éléments", () => {
    const hidden = applyToOverrides(emptyOverrides(), { type: "removeStep", stepId: s1 }, base);
    expect(hidden.steps[s1]).toEqual({ hidden: true });
    expect(hidden.extraSteps).toEqual([]);
    const extra = makeStep(ids(), act, "a05");
    let o = applyToOverrides(emptyOverrides(), { type: "addStep", step: extra }, base);
    o = applyToOverrides(o, { type: "addResource", resource: makeResource(ids(), { type: "step", stepId: extra.id }) }, base);
    o = applyToOverrides(o, { type: "removeStep", stepId: extra.id }, base);
    expect(o.extraSteps).toEqual([]);
    expect(o.resources.extra).toEqual([]);
  });
  it("ignore le retrait d'un élément inconnu", () => {
    const o = emptyOverrides();
    expect(applyToOverrides(o, { type: "removeApp", appId: ids() }, base)).toEqual(o);
  });
  it("ne mute pas les surcharges d'origine", () => {
    const o = deepFreeze(emptyOverrides());
    expect(() => applyToOverrides(o, { type: "setStepHidden", stepId: s1, hidden: true }, base)).not.toThrow();
  });
});

describe("déliaison", () => {
  it("fige le contenu et conserve les surcharges", () => {
    const withOverride = { ...corail, overrides: { ...emptyOverrides(), steps: { [s1]: { title: "Perso" } } } };
    const frozen = unlinkInstance(withOverride, master);
    expect(frozen.linked).toBe(false);
    expect(frozen.snapshot).toEqual(master);
    expect(frozen.overrides).toEqual(withOverride.overrides);
    expect(unlinkInstance(frozen, { ...master, steps: [] })).toBe(frozen); // déjà déliée : inchangée
  });
});
