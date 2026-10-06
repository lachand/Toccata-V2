import { appDocSchema, type AppDoc, type InstanceDoc, type MasterContent, type Overrides, type ResourceDoc, type StepDoc, type StepPatch } from "./entities";
import type { Id } from "./ids";

/** Une modification d'activité, indépendante de l'endroit où elle sera enregistrée. */
export type Edit =
  | { type: "setStepHidden"; stepId: Id; hidden: boolean }
  | { type: "setStepLocked"; stepId: Id; locked: boolean }
  | { type: "patchStep"; stepId: Id; patch: Pick<StepPatch, "title" | "instructions"> }
  | { type: "reorderStep"; stepId: Id; order: string }
  | { type: "addStep"; step: StepDoc }
  | { type: "removeStep"; stepId: Id }
  | { type: "addResource"; resource: ResourceDoc }
  | { type: "removeResource"; resourceId: Id }
  | { type: "addApp"; app: AppDoc }
  | { type: "removeApp"; appId: Id }
  | { type: "patchAppConfig"; appId: Id; config: Record<string, unknown> };

/** À qui s'adresse la modification (D5 de l'article : « run-time scripting » ciblé). */
export type Target = { type: "all" } | { type: "instances"; instanceIds: readonly Id[] };

export type Write = { scope: "master"; edit: Edit } | { scope: "instance"; instanceId: Id; edit: Edit };

export type Plan = Readonly<{
  writes: readonly Write[];
  /** Instances déliées : elles ne recevront pas une modification du master. */
  unreached: readonly Id[];
  /** Instances liées qui ont leur propre valeur pour le même champ : elles la gardent. */
  shadowed: readonly Id[];
  /** Identifiants demandés mais absents de la liste d'instances. */
  unknown: readonly Id[];
}>;

/**
 * Transforme « cette modification, pour ces destinataires » en écritures précises.
 *  - cible `all` : une seule écriture sur le master, vue par toutes les instances liées ;
 *  - cible `instances` : une écriture de surcharge par instance, le master ne bouge pas.
 */
export function planEdit(edit: Edit, target: Target, instances: readonly InstanceDoc[]): Plan {
  if (target.type === "all") {
    return {
      writes: [{ scope: "master", edit }],
      unreached: instances.filter((i) => !i.linked).map((i) => i.id),
      shadowed: instances.filter((i) => i.linked && isShadowed(edit, i)).map((i) => i.id),
      unknown: [],
    };
  }
  const known = new Set(instances.map((i) => i.id));
  const wanted = [...new Set(target.instanceIds)];
  return {
    writes: wanted.filter((id) => known.has(id)).map((instanceId) => ({ scope: "instance" as const, instanceId, edit })),
    unreached: [],
    shadowed: [],
    unknown: wanted.filter((id) => !known.has(id)),
  };
}

/** Vrai si l'instance a déjà sa propre valeur pour ce que `edit` change dans le master. */
export function isShadowed(edit: Edit, instance: InstanceDoc): boolean {
  const o = instance.overrides;
  switch (edit.type) {
    case "setStepHidden":
      return o.steps[edit.stepId]?.hidden !== undefined;
    case "setStepLocked":
      return o.steps[edit.stepId]?.locked !== undefined;
    case "patchStep": {
      const p = o.steps[edit.stepId];
      return !!p && Object.keys(edit.patch).some((k) => p[k as keyof StepPatch] !== undefined);
    }
    case "reorderStep":
      return o.steps[edit.stepId]?.order !== undefined;
    case "patchAppConfig": {
      const c = o.apps.config[edit.appId];
      return !!c && Object.keys(edit.config).some((k) => k in c);
    }
    default:
      return false;
  }
}

/** Retire les clés valant `undefined` pour qu'elles n'écrasent pas une valeur existante. */
const defined = <T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

const upsert = <T extends { id: string }>(list: readonly T[], item: T): T[] => [...list.filter((x) => x.id !== item.id), item];
const without = <T extends { id: string }>(list: readonly T[], id: string): T[] => list.filter((x) => x.id !== id);
const touchesStep = (scope: { type: string; stepId?: string }, stepId: string) => scope.type === "step" && scope.stepId === stepId;

/** Applique une modification au contenu du master (fonction pure). */
export function applyToMaster(c: MasterContent, edit: Edit): MasterContent {
  const mapStep = (stepId: Id, f: (s: StepDoc) => StepDoc): MasterContent => ({ ...c, steps: c.steps.map((s) => (s.id === stepId ? f(s) : s)) });
  switch (edit.type) {
    case "setStepHidden":
      return mapStep(edit.stepId, (s) => ({ ...s, hidden: edit.hidden }));
    case "setStepLocked":
      return mapStep(edit.stepId, (s) => ({ ...s, locked: edit.locked }));
    case "patchStep":
      return mapStep(edit.stepId, (s) => ({ ...s, ...defined(edit.patch) }));
    case "reorderStep":
      return mapStep(edit.stepId, (s) => ({ ...s, order: edit.order }));
    case "addStep":
      return { ...c, steps: upsert(c.steps, edit.step) };
    case "removeStep":
      return {
        ...c,
        steps: without(c.steps, edit.stepId),
        resources: c.resources.filter((r) => !touchesStep(r.scope, edit.stepId)),
        apps: c.apps.filter((a) => !touchesStep(a.scope, edit.stepId)),
      };
    case "addResource":
      return { ...c, resources: upsert(c.resources, edit.resource) };
    case "removeResource":
      return { ...c, resources: without(c.resources, edit.resourceId) };
    case "addApp":
      return { ...c, apps: upsert(c.apps, edit.app) };
    case "removeApp":
      return { ...c, apps: without(c.apps, edit.appId) };
    case "patchAppConfig":
      // Même règle que `resolve` : une fusion qui rendrait la config invalide est ignorée.
      return {
        ...c,
        apps: c.apps.map((a) => {
          if (a.id !== edit.appId) return a;
          const merged = appDocSchema.safeParse({ ...a, config: { ...a.config, ...edit.config } });
          return merged.success ? merged.data : a;
        }),
      };
  }
}

/**
 * Applique une modification aux surcharges d'une instance (fonction pure).
 * `base` indique ce que l'instance reçoit déjà du master, pour savoir s'il faut masquer un
 * élément hérité (au lieu de supprimer un élément propre à l'instance).
 */
export function applyToOverrides(o: Overrides, edit: Edit, base: Pick<MasterContent, "steps" | "resources" | "apps">): Overrides {
  const patch = (stepId: Id, p: StepPatch): Overrides => ({ ...o, steps: { ...o.steps, [stepId]: { ...o.steps[stepId], ...defined(p) } } });
  const addId = (list: readonly Id[], id: Id) => (list.includes(id) ? [...list] : [...list, id]);
  switch (edit.type) {
    case "setStepHidden":
      return patch(edit.stepId, { hidden: edit.hidden });
    case "setStepLocked":
      return patch(edit.stepId, { locked: edit.locked });
    case "patchStep":
      return patch(edit.stepId, edit.patch);
    case "reorderStep":
      return patch(edit.stepId, { order: edit.order });
    case "addStep":
      return { ...o, extraSteps: upsert(o.extraSteps, edit.step) };
    case "removeStep": {
      if (o.extraSteps.some((s) => s.id === edit.stepId)) {
        return {
          ...o,
          extraSteps: without(o.extraSteps, edit.stepId),
          resources: { ...o.resources, extra: o.resources.extra.filter((r) => !touchesStep(r.scope, edit.stepId)) },
          apps: { ...o.apps, extra: o.apps.extra.filter((a) => !touchesStep(a.scope, edit.stepId)) },
        };
      }
      return patch(edit.stepId, { hidden: true }); // étape héritée : on la masque, on ne la supprime pas
    }
    case "addResource":
      return { ...o, resources: { extra: upsert(o.resources.extra, edit.resource), hidden: o.resources.hidden.filter((id) => id !== edit.resource.id) } };
    case "removeResource":
      return o.resources.extra.some((r) => r.id === edit.resourceId)
        ? { ...o, resources: { ...o.resources, extra: without(o.resources.extra, edit.resourceId) } }
        : base.resources.some((r) => r.id === edit.resourceId)
          ? { ...o, resources: { ...o.resources, hidden: addId(o.resources.hidden, edit.resourceId) } }
          : o;
    case "addApp":
      return { ...o, apps: { ...o.apps, extra: upsert(o.apps.extra, edit.app), hidden: o.apps.hidden.filter((id) => id !== edit.app.id) } };
    case "removeApp":
      return o.apps.extra.some((a) => a.id === edit.appId)
        ? { ...o, apps: { ...o.apps, extra: without(o.apps.extra, edit.appId) } }
        : base.apps.some((a) => a.id === edit.appId)
          ? { ...o, apps: { ...o.apps, hidden: addId(o.apps.hidden, edit.appId) } }
          : o;
    case "patchAppConfig":
      return { ...o, apps: { ...o.apps, config: { ...o.apps.config, [edit.appId]: { ...o.apps.config[edit.appId], ...edit.config } } } };
  }
}

/**
 * Déliaison : l'instance cesse de suivre le master et garde le contenu qu'elle voyait à cet
 * instant. Les surcharges existantes sont conservées.
 */
export function unlinkInstance(instance: InstanceDoc, master: MasterContent): InstanceDoc {
  return instance.linked ? { ...instance, linked: false, snapshot: master } : instance;
}

/** Reliaison : l'instance suit de nouveau le master ; l'instantané est abandonné. */
export function relinkInstance(instance: InstanceDoc): InstanceDoc {
  return instance.linked ? instance : { ...instance, linked: true, snapshot: null };
}
