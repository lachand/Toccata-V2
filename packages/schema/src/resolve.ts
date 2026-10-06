import { appDocSchema, type AppDoc, type InstanceDoc, type MasterContent, type ResourceDoc, type StepDoc } from "./entities";
import type { Id } from "./ids";

export type Viewer = { role: "teacher" | "student" };

export type ResolvedStep = Readonly<{
  id: Id;
  title: string;
  instructions: string;
  order: string;
  hidden: boolean;
  locked: boolean;
  blockedByAppId: Id | null;
  /** `instance` : étape ajoutée dans cette instance seulement. */
  origin: "master" | "instance";
  resources: readonly ResourceDoc[];
  apps: readonly AppDoc[];
}>;

export type Issue = Readonly<{
  code:
    | "stale-step-patch"
    | "stale-app-config"
    | "duplicate-id"
    | "orphan-scope"
    | "invalid-app-config"
    | "missing-snapshot";
  id: string;
}>;

export type ResolvedActivity = Readonly<{
  instanceId: Id;
  title: string;
  description: string;
  linked: boolean;
  steps: readonly ResolvedStep[];
  /** Ressources et apps valables pour toute l'activité (portée `activity`). */
  activityResources: readonly ResourceDoc[];
  activityApps: readonly AppDoc[];
  /** Incohérences rencontrées (références orphelines…). Jamais bloquantes. */
  issues: readonly Issue[];
}>;

const byOrderThenId = (a: { order: string; id: string }, b: { order: string; id: string }) =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const byCreation = (a: { createdAt: number; id: string }, b: { createdAt: number; id: string }) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Contenu effectif d'une instance : fonction pure et déterministe.
 *
 *   base      = master si l'instance est liée, sinon l'instantané pris à la déliaison
 *   effectif  = base + surcharges de l'instance (les surcharges l'emportent, champ par champ)
 *
 * Une modification du master apparaît donc dans toutes les instances liées, et une surcharge
 * n'est jamais visible d'une autre instance. Les entrées ne sont jamais modifiées.
 */
export function resolve(master: MasterContent, instance: InstanceDoc, viewer: Viewer): ResolvedActivity {
  const issues: Issue[] = [];
  let base = master;
  if (!instance.linked) {
    if (instance.snapshot) base = instance.snapshot;
    else issues.push({ code: "missing-snapshot", id: instance.id });
  }
  const o = instance.overrides;

  // --- étapes
  const baseIds = new Set(base.steps.map((s) => s.id));
  const extraSteps: StepDoc[] = [];
  const seenExtra = new Set<string>();
  for (const s of o.extraSteps) {
    if (baseIds.has(s.id) || seenExtra.has(s.id)) {
      issues.push({ code: "duplicate-id", id: s.id });
      continue;
    }
    seenExtra.add(s.id);
    extraSteps.push(s);
  }
  const allSteps = [...base.steps.map((s) => ({ s, origin: "master" as const })), ...extraSteps.map((s) => ({ s, origin: "instance" as const }))];
  const stepIds = new Set(allSteps.map((x) => x.s.id));
  for (const id of Object.keys(o.steps)) if (!stepIds.has(id)) issues.push({ code: "stale-step-patch", id });

  // --- ressources et apps
  const resources = mergeById(base.resources, o.resources.extra, o.resources.hidden, issues).sort(byCreation);
  const apps = applyAppConfig(mergeById(base.apps, o.apps.extra, o.apps.hidden, issues), o.apps.config, issues).sort(byCreation);

  const forStep = <T extends { scope: { type: string; stepId?: string } }>(items: T[], stepId: string) =>
    items.filter((i) => i.scope.type === "step" && i.scope.stepId === stepId);
  for (const item of [...resources, ...apps]) {
    if (item.scope.type === "step" && !stepIds.has(item.scope.stepId)) issues.push({ code: "orphan-scope", id: item.id });
  }

  const resolved: ResolvedStep[] = allSteps
    .map(({ s, origin }) => {
      const p = o.steps[s.id];
      const step = {
        id: s.id,
        title: p?.title ?? s.title,
        instructions: p?.instructions ?? s.instructions,
        order: p?.order ?? s.order,
        hidden: p?.hidden ?? s.hidden,
        locked: p?.locked ?? s.locked,
        blockedByAppId: s.blockedByAppId,
        origin,
      };
      return step;
    })
    .filter((s) => viewer.role === "teacher" || !s.hidden) // un élève ne reçoit jamais une étape masquée
    .sort(byOrderThenId)
    .map((s) => ({ ...s, resources: forStep(resources, s.id), apps: forStep(apps, s.id) }));

  return {
    instanceId: instance.id,
    title: base.activity.title,
    description: base.activity.description,
    linked: instance.linked,
    steps: resolved,
    activityResources: resources.filter((r) => r.scope.type === "activity"),
    activityApps: apps.filter((a) => a.scope.type === "activity"),
    issues,
  };
}

function mergeById<T extends { id: string }>(base: readonly T[], extra: readonly T[], hidden: readonly string[], issues: Issue[]): T[] {
  const hide = new Set(hidden);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...base, ...extra]) {
    if (seen.has(item.id)) {
      issues.push({ code: "duplicate-id", id: item.id });
      continue;
    }
    seen.add(item.id);
    if (!hide.has(item.id)) out.push(item);
  }
  return out;
}

function applyAppConfig(apps: AppDoc[], patches: Readonly<Record<string, Record<string, unknown>>>, issues: Issue[]): AppDoc[] {
  const known = new Set(apps.map((a) => a.id));
  for (const id of Object.keys(patches)) if (!known.has(id)) issues.push({ code: "stale-app-config", id });
  return apps.map((app) => {
    const patch = patches[app.id];
    if (!patch) return app;
    const merged = appDocSchema.safeParse({ ...app, config: { ...app.config, ...patch } });
    if (!merged.success) {
      issues.push({ code: "invalid-app-config", id: app.id });
      return app;
    }
    return merged.data;
  });
}
