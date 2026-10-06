import { generateNKeysBetween } from "fractional-indexing";
import { emptyOverrides, newId, type AppDoc, type Edit, type Id, type InstanceDoc, type MasterContent, type ResourceDoc, type StepDoc } from "../src";

export type Rand = () => number;

/** PRNG déterministe (mulberry32) : les scénarios aléatoires sont reproductibles à partir d'une graine. */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)]!;
export const chance = (r: Rand, p: number) => r() < p;

export function idFactory(r: Rand): () => Id {
  const seen = new Set<string>();
  return () => {
    for (;;) {
      const id = newId(1_700_000_000_000 + int(r, 0, 1e9), (n) => Uint8Array.from({ length: n }, () => int(r, 0, 255)));
      if (!seen.has(id)) {
        seen.add(id);
        return id;
      }
    }
  };
}

const T0 = 1_700_000_000_000;

export function makeStep(id: Id, activityId: Id, order: string, over: Partial<StepDoc> = {}): StepDoc {
  return { id, kind: "step", activityId, title: `Étape ${id.slice(-4)}`, instructions: "", order, hidden: false, locked: false, blockedByAppId: null, createdAt: T0, updatedAt: T0, ...over };
}

export function makeResource(id: Id, scope: ResourceDoc["scope"], over: Partial<ResourceDoc> = {}): ResourceDoc {
  return { id, kind: "resource", scope, name: `Ressource ${id.slice(-4)}`, source: { type: "url", url: "https://example.org/doc", display: "iframe" }, createdAt: T0, updatedAt: T0, ...over };
}

export function makeTimer(id: Id, scope: AppDoc["scope"], durationSec = 180): AppDoc {
  return { id, kind: "app", type: "timer", scope, name: "Chronomètre", config: { durationSec }, createdAt: T0, updatedAt: T0 };
}

export function makeKanban(id: Id, scope: AppDoc["scope"]): AppDoc {
  return { id, kind: "app", type: "kanban", scope, name: "Kanban", config: { columns: [{ id: "todo", title: "À faire" }, { id: "done", title: "Fait" }] }, createdAt: T0, updatedAt: T0 };
}

export function makeInstance(id: Id, masterId: Id, authorId: Id, over: Partial<InstanceDoc> = {}): InstanceDoc {
  return { id, kind: "instance", masterId, name: "Groupe", memberIds: [], linked: true, snapshot: null, overrides: emptyOverrides(), authorId, teacherOnly: true, createdAt: T0, updatedAt: T0, ...over };
}

/** Un master aléatoire mais valide : étapes dans le désordre dans le tableau, clés d'ordre distinctes. */
export function genMaster(r: Rand, ids: () => Id): MasterContent {
  const activityId = ids();
  const n = int(r, 0, 6);
  const keys = n ? generateNKeysBetween(null, null, n) : [];
  const shuffled = [...keys].sort(() => r() - 0.5);
  const steps = shuffled.map((order) => makeStep(ids(), activityId, order, { hidden: chance(r, 0.25), locked: chance(r, 0.1), createdAt: T0 + int(r, 0, 1000) }));
  const scope = (): ResourceDoc["scope"] => (steps.length && chance(r, 0.6) ? { type: "step", stepId: pick(r, steps).id } : { type: "activity" });
  const resources = Array.from({ length: int(r, 0, 5) }, () => makeResource(ids(), scope(), { createdAt: T0 + int(r, 0, 1000) }));
  const apps = Array.from({ length: int(r, 0, 4) }, () => (chance(r, 0.5) ? makeTimer(ids(), scope(), int(r, 30, 600)) : makeKanban(ids(), scope())));
  const owner = ids();
  return { activity: { id: activityId, kind: "activity", ownerId: owner, title: "Activité", description: "", createdAt: T0, updatedAt: T0 }, steps, resources, apps };
}

/** Une modification plausible : cible des éléments existants (ou, parfois, un identifiant inconnu). */
export function genEdit(r: Rand, m: MasterContent, ids: () => Id): Edit {
  const stepId = () => (m.steps.length && chance(r, 0.9) ? pick(r, m.steps).id : ids());
  const kinds = ["setStepHidden", "setStepLocked", "patchStep", "reorderStep", "addStep", "removeStep", "addResource", "removeResource", "addApp", "removeApp", "patchAppConfig"] as const;
  switch (pick(r, kinds)) {
    case "setStepHidden":
      return { type: "setStepHidden", stepId: stepId(), hidden: chance(r, 0.5) };
    case "setStepLocked":
      return { type: "setStepLocked", stepId: stepId(), locked: chance(r, 0.5) };
    case "patchStep":
      return { type: "patchStep", stepId: stepId(), patch: { title: `Titre ${int(r, 0, 99)}` } };
    case "reorderStep":
      return { type: "reorderStep", stepId: stepId(), order: `a${int(r, 0, 9)}${int(r, 0, 9)}` };
    case "addStep":
      return { type: "addStep", step: makeStep(ids(), m.activity.id, `b${int(r, 0, 9)}${int(r, 0, 9)}`, { createdAt: T0 + int(r, 0, 1000) }) };
    case "removeStep":
      return { type: "removeStep", stepId: stepId() };
    case "addResource":
      return { type: "addResource", resource: makeResource(ids(), { type: "activity" }, { createdAt: T0 + int(r, 0, 1000) }) };
    case "removeResource":
      return { type: "removeResource", resourceId: m.resources.length && chance(r, 0.8) ? pick(r, m.resources).id : ids() };
    case "addApp":
      return { type: "addApp", app: makeTimer(ids(), { type: "activity" }, int(r, 30, 600)) };
    case "removeApp":
      return { type: "removeApp", appId: m.apps.length && chance(r, 0.8) ? pick(r, m.apps).id : ids() };
    case "patchAppConfig": {
      const app = m.apps.length ? pick(r, m.apps) : null;
      // moitié de patchs valides, moitié invalides (doivent être ignorés partout)
      const config = chance(r, 0.5) ? { durationSec: int(r, 1, 900) } : { durationSec: -5, columns: "pas un tableau" };
      return { type: "patchAppConfig", appId: app?.id ?? ids(), config };
    }
  }
}

export function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}
