import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyToMaster, applyToOverrides, emptyOverrides, relinkInstance, resolve, unlinkInstance, type Edit, type Viewer } from "../src";
import { deepFreeze, genEdit, genMaster, idFactory, makeInstance, makeKanban, makeResource, makeStep, makeTimer, rng } from "./factories";

const teacher: Viewer = { role: "teacher" };
const student: Viewer = { role: "student" };
const RUNS = { numRuns: 400 };
/** Ce que l'utilisateur voit, sans l'origine (une étape ajoutée dans une surcharge a l'origine « instance »). */
const view = (res: ReturnType<typeof resolve>) => ({
  title: res.title,
  steps: res.steps.map(({ origin: _o, ...s }) => s),
  activityResources: res.activityResources,
  activityApps: res.activityApps,
});

function scenario(seed: number) {
  const r = rng(seed);
  const ids = idFactory(r);
  const master = genMaster(r, ids);
  const instance = makeInstance(ids(), master.activity.id, master.activity.ownerId);
  return { r, ids, master, instance };
}

describe("resolve : exemples", () => {
  const ids = idFactory(rng(1));
  const act = ids();
  const [s1, s2, s3] = [ids(), ids(), ids()] as const;
  const master = {
    activity: { id: act, kind: "activity" as const, ownerId: ids(), title: "Atelier", description: "d", createdAt: 1, updatedAt: 1 },
    // volontairement dans le désordre
    steps: [makeStep(s2, act, "a1", { title: "Deux" }), makeStep(s1, act, "a0", { title: "Un" }), makeStep(s3, act, "a2", { title: "Trois (brouillon)", hidden: true })],
    resources: [makeResource(ids(), { type: "step", stepId: s1 }), makeResource(ids(), { type: "activity" })],
    apps: [makeTimer(ids(), { type: "step", stepId: s2 }, 180), makeKanban(ids(), { type: "activity" })],
  };
  const inst = () => makeInstance(ids(), act, master.activity.ownerId);

  it("ordonne les étapes par clé d'ordre et rattache ressources et apps à leur étape", () => {
    const res = resolve(master, inst(), teacher);
    expect(res.steps.map((s) => s.title)).toEqual(["Un", "Deux", "Trois (brouillon)"]);
    expect(res.steps[0]!.resources).toHaveLength(1);
    expect(res.steps[1]!.apps.map((a) => a.type)).toEqual(["timer"]);
    expect(res.activityResources).toHaveLength(1);
    expect(res.activityApps.map((a) => a.type)).toEqual(["kanban"]);
    expect(res.issues).toEqual([]);
  });

  it("montre à l'enseignant les étapes masquées, pas à l'élève", () => {
    expect(resolve(master, inst(), teacher).steps.find((s) => s.id === s3)?.hidden).toBe(true);
    expect(resolve(master, inst(), student).steps.map((s) => s.id)).toEqual([s1, s2]);
  });

  it("applique les surcharges d'instance champ par champ", () => {
    const i = { ...inst(), overrides: { ...emptyOverrides(), steps: { [s3]: { hidden: false }, [s1]: { title: "Un bis", order: "a3" } } } };
    const res = resolve(master, i, student);
    expect(res.steps.map((s) => s.title)).toEqual(["Deux", "Trois (brouillon)", "Un bis"]);
  });

  it("garde les égalités d'ordre dans un ordre stable (identifiant)", () => {
    const dup = { ...master, steps: [makeStep(s2, act, "a0"), makeStep(s1, act, "a0")] };
    const [x, y] = [s1, s2].sort();
    expect(resolve(dup, inst(), teacher).steps.map((s) => s.id)).toEqual([x, y]);
  });

  it("ajoute des étapes, ressources et apps propres à l'instance", () => {
    const extra = ids();
    const i = {
      ...inst(),
      overrides: {
        ...emptyOverrides(),
        extraSteps: [makeStep(extra, act, "a05", { title: "Bonus groupe" })],
        resources: { extra: [makeResource(ids(), { type: "step", stepId: extra })], hidden: [] },
      },
    };
    const res = resolve(master, i, teacher);
    expect(res.steps.map((s) => s.title)).toEqual(["Un", "Bonus groupe", "Deux", "Trois (brouillon)"]);
    expect(res.steps[1]!.origin).toBe("instance");
    expect(res.steps[1]!.resources).toHaveLength(1);
  });

  it("masque une ressource ou une app héritée", () => {
    const hiddenRes = master.resources[1]!.id;
    const hiddenApp = master.apps[1]!.id;
    const i = { ...inst(), overrides: { ...emptyOverrides(), resources: { extra: [], hidden: [hiddenRes] }, apps: { extra: [], hidden: [hiddenApp], config: {} } } };
    const res = resolve(master, i, student);
    expect(res.activityResources).toEqual([]);
    expect(res.activityApps).toEqual([]);
  });

  it("fusionne la config d'une app, et ignore une fusion invalide en le signalant", () => {
    const timerId = master.apps[0]!.id;
    const ok = { ...inst(), overrides: { ...emptyOverrides(), apps: { extra: [], hidden: [], config: { [timerId]: { durationSec: 600 } } } } };
    expect(resolve(master, ok, teacher).steps[1]!.apps[0]).toMatchObject({ config: { durationSec: 600 } });
    const bad = { ...inst(), overrides: { ...emptyOverrides(), apps: { extra: [], hidden: [], config: { [timerId]: { durationSec: -1 } } } } };
    const res = resolve(master, bad, teacher);
    expect(res.steps[1]!.apps[0]).toMatchObject({ config: { durationSec: 180 } });
    expect(res.issues).toContainEqual({ code: "invalid-app-config", id: timerId });
  });

  it("signale sans planter les références orphelines", () => {
    const ghost = ids();
    const orphan = makeResource(ids(), { type: "step", stepId: ghost });
    const i = { ...inst(), overrides: { ...emptyOverrides(), steps: { [ghost]: { hidden: true } }, resources: { extra: [orphan], hidden: [] }, apps: { extra: [], hidden: [], config: { [ghost]: {} } } } };
    const codes = resolve(master, i, teacher).issues.map((x) => x.code).sort();
    expect(codes).toEqual(["orphan-scope", "stale-app-config", "stale-step-patch"]);
  });

  it("ignore une étape propre à l'instance dont l'identifiant duplique celui du master", () => {
    const i = { ...inst(), overrides: { ...emptyOverrides(), extraSteps: [makeStep(s1, act, "a9", { title: "Imposteur" })] } };
    const res = resolve(master, i, teacher);
    expect(res.steps.map((s) => s.title)).not.toContain("Imposteur");
    expect(res.issues).toContainEqual({ code: "duplicate-id", id: s1 });
  });

  it("une instance déliée garde le contenu figé à la déliaison", () => {
    const frozen = unlinkInstance(inst(), master);
    const changed = applyToMaster(master, { type: "patchStep", stepId: s1, patch: { title: "Modifié après coup" } });
    expect(resolve(changed, frozen, teacher).steps[0]!.title).toBe("Un");
    expect(resolve(changed, relinkInstance(frozen), teacher).steps[0]!.title).toBe("Modifié après coup");
  });

  it("retombe sur le master, en le signalant, si une instance déliée n'a pas d'instantané", () => {
    const broken = { ...inst(), linked: false, snapshot: null };
    const res = resolve(master, broken, teacher);
    expect(res.steps).toHaveLength(3);
    expect(res.issues).toContainEqual({ code: "missing-snapshot", id: broken.id });
  });
});

describe("resolve : propriétés (scénarios aléatoires reproductibles)", () => {
  it("ne modifie pas ses entrées et est déterministe", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { r, ids, master, instance } = scenario(seed);
        let i = instance;
        for (let k = 0; k < 4; k++) i = { ...i, overrides: applyToOverrides(i.overrides, genEdit(r, master, ids), master) };
        deepFreeze(master);
        deepFreeze(i);
        const a = resolve(master, i, teacher);
        const b = resolve(master, i, teacher);
        expect(a).toEqual(b);
      }),
      RUNS,
    );
  });

  it("un élève ne reçoit jamais d'étape masquée ; chaque étape apparaît une seule fois, triée", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { r, ids, master, instance } = scenario(seed);
        let i = instance;
        for (let k = 0; k < 5; k++) i = { ...i, overrides: applyToOverrides(i.overrides, genEdit(r, master, ids), master) };
        const s = resolve(master, i, student);
        expect(s.steps.every((x) => !x.hidden)).toBe(true);
        const t = resolve(master, i, teacher);
        for (const res of [s, t]) {
          const idsSeen = res.steps.map((x) => x.id);
          expect(new Set(idsSeen).size).toBe(idsSeen.length);
          const keys = res.steps.map((x) => [x.order, x.id]);
          expect(keys).toEqual([...keys].sort((p, q) => (p[0]! < q[0]! ? -1 : p[0]! > q[0]! ? 1 : p[1]! < q[1]! ? -1 : 1)));
        }
        // l'élève voit exactement les étapes de l'enseignant qui ne sont pas masquées
        expect(s.steps.map((x) => x.id)).toEqual(t.steps.filter((x) => !x.hidden).map((x) => x.id));
      }),
      RUNS,
    );
  });

  it("modifier le master ou écrire la même modification dans une surcharge donne le même résultat", () => {
    // Équivalence des deux chemins de « run-time scripting » (cible « toute la classe » vs « cette instance »).
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { r, ids, master, instance } = scenario(seed);
        const edit: Edit = genEdit(r, master, ids);
        const overridden = { ...instance, overrides: applyToOverrides(instance.overrides, edit, master) };
        const m2 = applyToMaster(master, edit);
        expect(view(resolve(master, overridden, student))).toEqual(view(resolve(m2, instance, student)));
        if (edit.type !== "removeStep") {
          // l'enseignant voit les mêmes étapes (sauf suppression : l'instance masque, le master supprime)
          expect(view(resolve(master, overridden, teacher))).toEqual(view(resolve(m2, instance, teacher)));
        }
      }),
      RUNS,
    );
  });

  it("une instance liée suit le master ; une instance déliée ne bouge plus", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { r, ids, master, instance } = scenario(seed);
        const master2 = Array.from({ length: 3 }, () => genEdit(r, master, ids)).reduce(applyToMaster, master);
        const frozen = unlinkInstance(instance, master);
        // à l'instant de la déliaison, rien ne change pour l'utilisateur
        expect(view(resolve(master, frozen, teacher))).toEqual(view(resolve(master, instance, teacher)));
        // après modification du master : liée = suit, déliée = figée, reliée = suit de nouveau
        expect(view(resolve(master2, frozen, teacher))).toEqual(view(resolve(master, instance, teacher)));
        expect(view(resolve(master2, relinkInstance(frozen), teacher))).toEqual(view(resolve(master2, instance, teacher)));
      }),
      RUNS,
    );
  });

  it("une surcharge d'une instance n'est jamais visible depuis une autre", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { r, ids, master, instance } = scenario(seed);
        const other = makeInstance(ids(), master.activity.id, master.activity.ownerId);
        const before = resolve(master, other, teacher);
        const touched = { ...instance, overrides: applyToOverrides(instance.overrides, genEdit(r, master, ids), master) };
        void resolve(master, touched, teacher);
        expect(resolve(master, other, teacher)).toEqual(before);
      }),
      RUNS,
    );
  });
});
