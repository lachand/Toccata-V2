import { z } from "zod";
import { activityDocSchema, appDocSchema, resourceDocSchema, stepDocSchema, type ActivityDoc, type AppDoc, type MasterContent, type ResourceDoc, type StepDoc } from "./entities";
import { newId, type Id } from "./ids";

/**
 * Format d'échange d'une activité (fichier `.toccata`, modèle partagé, copie) : le CONTENU du script, sans aucun participant,
 * aucune donnée d'exécution, aucune note. Les identifiants d'origine n'ont pas de valeur : ils sont tous recréés à l'import
 * (`instantiateBundle`), ce qui évite les collisions et ne dévoile rien de l'activité source.
 */
export const BUNDLE_VERSION = 1;

export const bundleSchema = z.object({
  format: z.literal("toccata"),
  version: z.literal(BUNDLE_VERSION),
  exportedAt: z.number().int().nonnegative(),
  activity: activityDocSchema.pick({ title: true, description: true, locale: true }),
  steps: z.array(stepDocSchema).max(200),
  resources: z.array(resourceDocSchema).max(500),
  apps: z.array(appDocSchema).max(200),
});
export type Bundle = z.infer<typeof bundleSchema>;

export function toBundle(content: MasterContent, now: number): Bundle {
  const { title, description, locale } = content.activity;
  return { format: "toccata", version: BUNDLE_VERSION, exportedAt: now, activity: { title, description, ...(locale ? { locale } : {}) }, steps: content.steps, resources: content.resources, apps: content.apps };
}

export type ParsedBundle = { ok: true; bundle: Bundle } | { ok: false; reason: "not_toccata" | "unsupported_version" | "invalid" };

export function parseBundle(raw: unknown): ParsedBundle {
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== "toccata") return { ok: false, reason: "not_toccata" };
  if ((raw as { version?: unknown }).version !== BUNDLE_VERSION) return { ok: false, reason: "unsupported_version" };
  const r = bundleSchema.safeParse(raw);
  return r.success ? { ok: true, bundle: r.data } : { ok: false, reason: "invalid" };
}

export type Instantiated = Readonly<{
  activity: ActivityDoc;
  steps: StepDoc[];
  resources: ResourceDoc[];
  apps: AppDoc[];
  /** Fichiers à fournir (empreintes `file_<sha256>`) pour que les ressources de type fichier soient lisibles. */
  fileIds: string[];
}>;

/**
 * Crée un nouvel exemplaire du contenu : TOUS les identifiants sont neufs, et les références entre éléments (portée d'une
 * ressource, étape bloquée par un questionnaire…) sont réécrites. Une référence vers un élément absent du lot est
 * neutralisée (ressource ou application orpheline écartée, blocage retiré) plutôt que conservée à l'état de lien mort.
 */
export function instantiateBundle(bundle: Bundle, ownerId: Id, now: number, opts: { forkedFrom?: Id; title?: string; /** Identifiant imposé à l'activité (celui de la base que le serveur vient de créer). */ activityId?: Id; id?: () => Id } = {}): Instantiated {
  const mint = opts.id ?? (() => newId(now));
  const activityId = opts.activityId ?? mint();
  const stepIds = new Map(bundle.steps.map((s) => [s.id, mint()]));
  const appIds = new Map(bundle.apps.map((a) => [a.id, mint()]));
  const stamp = { createdAt: now, updatedAt: now };
  const scopeOf = (scope: ResourceDoc["scope"]): ResourceDoc["scope"] | null => {
    if (scope.type === "activity") return scope;
    const id = stepIds.get(scope.stepId);
    return id ? { type: "step", stepId: id } : null;
  };

  const steps: StepDoc[] = bundle.steps.map((s) => ({ ...s, ...stamp, id: stepIds.get(s.id)!, activityId, blockedByAppId: s.blockedByAppId ? (appIds.get(s.blockedByAppId) ?? null) : null }));
  const resources: ResourceDoc[] = bundle.resources.flatMap((r) => {
    const scope = scopeOf(r.scope);
    return scope ? [{ ...r, ...stamp, id: mint(), scope }] : [];
  });
  const apps: AppDoc[] = bundle.apps.flatMap((a) => {
    const scope = scopeOf(a.scope);
    return scope ? [{ ...a, ...stamp, id: appIds.get(a.id)!, scope } as AppDoc] : [];
  });
  const kept = new Set(apps.map((a) => a.id));
  for (const s of steps) if (s.blockedByAppId && !kept.has(s.blockedByAppId)) s.blockedByAppId = null;

  const activity: ActivityDoc = {
    id: activityId,
    kind: "activity",
    ownerId,
    title: (opts.title ?? bundle.activity.title).slice(0, 200),
    description: bundle.activity.description,
    ...(bundle.activity.locale ? { locale: bundle.activity.locale } : {}),
    ...(opts.forkedFrom ? { forkedFrom: opts.forkedFrom } : {}),
    ...stamp,
  };
  const fileIds = [...new Set(resources.flatMap((r) => (r.source.type === "file" ? [r.source.fileId] : [])))];
  return { activity, steps, resources, apps, fileIds };
}

/** Retire les ressources de type fichier (un modèle partagé n'embarque pas de fichiers : voir ADR 0016). */
export function withoutFiles(bundle: Bundle): Bundle {
  const dropped = new Set(bundle.resources.filter((r) => r.source.type === "file").map((r) => r.id));
  return { ...bundle, resources: bundle.resources.filter((r) => !dropped.has(r.id)) };
}

/** Modèle partagé dans la bibliothèque (base `library`). Le nom de l'auteur est affiché aux autres enseignants : le publier est un acte volontaire. */
export const templateDocSchema = z.object({
  id: idSchemaLocal(),
  kind: z.literal("template"),
  authorId: idSchemaLocal(),
  authorName: z.string().min(1).max(80),
  title: z.string().max(200),
  description: z.string().max(10_000),
  locale: z.string().min(2).max(10).optional(),
  /** Lot sans fichiers (ADR 0016). */
  bundle: bundleSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type TemplateDoc = z.infer<typeof templateDocSchema>;

function idSchemaLocal() {
  return z.string().regex(/^[0-9a-hjkmnp-tv-z]{22}$/, "identifiant invalide");
}

/** Construit le document de bibliothèque d'un contenu : sans fichiers, avec le nom affiché de l'auteur. */
export function toTemplate(content: MasterContent, author: { id: Id; name: string }, now: number, id: Id = newId(now)): TemplateDoc {
  const bundle = withoutFiles(toBundle(content, now));
  return { id, kind: "template", authorId: author.id, authorName: author.name.slice(0, 80), title: bundle.activity.title, description: bundle.activity.description, ...(bundle.activity.locale ? { locale: bundle.activity.locale } : {}), bundle, createdAt: now, updatedAt: now };
}
