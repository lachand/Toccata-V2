import { z } from "zod";
import { idSchema } from "./ids";

/* ------------------------------------------------------------------ briques communes */

const epoch = z.number().int().nonnegative();
/** Clé d'ordre « fractional indexing » : tri lexicographique, insertion sans renumérotation. */
export const orderKeySchema = z.string().min(1).max(64);
/** HTTPS uniquement (ADR 0005) : pas de `javascript:`, `data:` ni `http:`. */
export const httpsUrlSchema = z
  .url()
  .max(2048)
  .refine((u) => u.startsWith("https://"), "https uniquement");
export const displayModeSchema = z.enum(["iframe", "window", "link"]);

const masterBase = { id: idSchema, createdAt: epoch, updatedAt: epoch };
/** Les documents d'instance portent l'auteur (vérifié par validate_doc_update côté CouchDB). */
const instanceBase = { id: idSchema, authorId: idSchema, createdAt: epoch, updatedAt: epoch, teacherOnly: z.boolean().optional() };

/* ------------------------------------------------------------------ contenu (base master_<id>) */

export const activityDocSchema = z.object({
  ...masterBase,
  kind: z.literal("activity"),
  ownerId: idSchema,
  title: z.string().max(200),
  description: z.string().max(10_000),
  /** Langue du contenu (filtre de la bibliothèque de modèles), pas celle de l'interface. */
  locale: z.string().min(2).max(10).optional(),
  forkedFrom: idSchema.optional(),
});

export const stepDocSchema = z.object({
  ...masterBase,
  kind: z.literal("step"),
  activityId: idSchema,
  title: z.string().max(200),
  instructions: z.string().max(50_000),
  order: orderKeySchema,
  /** « L'œil » : masquée aux élèves (brouillon, bonus, variante par groupe). */
  hidden: z.boolean(),
  /** Verrouillée par l'enseignant (micro-orchestration). */
  locked: z.boolean(),
  /** Étape bloquée tant que ce questionnaire n'est pas rempli. */
  blockedByAppId: idSchema.nullable(),
});

export const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activity") }),
  z.object({ type: z.literal("step"), stepId: idSchema }),
]);

export const resourceSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: httpsUrlSchema, display: displayModeSchema }),
  z.object({ type: z.literal("file"), fileId: z.string().regex(/^file_[0-9a-f]{64}$/), mime: z.string().max(127), size: z.number().int().nonnegative() }),
]);

export const resourceDocSchema = z.object({
  ...masterBase,
  kind: z.literal("resource"),
  scope: scopeSchema,
  name: z.string().min(1).max(200),
  source: resourceSourceSchema,
});

export const formFieldSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(500),
  type: z.enum(["text", "longtext", "choice", "multichoice", "file"]),
  required: z.boolean(),
  options: z.array(z.string().max(200)).max(50).optional(),
});

const appBase = { ...masterBase, kind: z.literal("app"), scope: scopeSchema, name: z.string().min(1).max(200) };

/** Registre des applications : union discriminée par `type`. */
export const appDocSchema = z.discriminatedUnion("type", [
  z.object({ ...appBase, type: z.literal("timer"), config: z.object({ durationSec: z.number().int().min(1).max(86_400) }) }),
  z.object({
    ...appBase,
    type: z.literal("kanban"),
    config: z.object({ columns: z.array(z.object({ id: z.string().min(1).max(40), title: z.string().max(100) })).min(1).max(12) }),
  }),
  z.object({ ...appBase, type: z.literal("text"), config: z.object({}) }),
  z.object({
    ...appBase,
    type: z.literal("form"),
    config: z.object({ fields: z.array(formFieldSchema).max(100), blocking: z.boolean() }),
  }),
  z.object({ ...appBase, type: z.literal("external"), config: z.object({ url: httpsUrlSchema, display: displayModeSchema }) }),
]);

export const masterDocSchema = z.union([activityDocSchema, stepDocSchema, resourceDocSchema, appDocSchema]);

/* ------------------------------------------------------------------ surcharges d'une instance */

export const stepPatchSchema = z.object({
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  title: z.string().max(200).optional(),
  instructions: z.string().max(50_000).optional(),
  order: orderKeySchema.optional(),
});

export const overridesSchema = z.object({
  steps: z.record(idSchema, stepPatchSchema),
  extraSteps: z.array(stepDocSchema),
  resources: z.object({ extra: z.array(resourceDocSchema), hidden: z.array(idSchema) }),
  apps: z.object({
    extra: z.array(appDocSchema),
    hidden: z.array(idSchema),
    /** Fusion superficielle dans `config` ; ignorée si le résultat n'est plus valide. */
    config: z.record(idSchema, z.record(z.string(), z.unknown())),
  }),
});

export const emptyOverrides = (): Overrides => ({
  steps: {},
  extraSteps: [],
  resources: { extra: [], hidden: [] },
  apps: { extra: [], hidden: [], config: {} },
});

/** Contenu du master à un instant donné (sert aussi d'instantané lors de la déliaison). */
export const masterContentSchema = z.object({
  activity: activityDocSchema,
  steps: z.array(stepDocSchema),
  resources: z.array(resourceDocSchema),
  apps: z.array(appDocSchema),
});

/* ------------------------------------------------------------------ données d'une instance (base inst_<id>) */

export const instanceDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("instance"),
  masterId: idSchema,
  name: z.string().max(200),
  memberIds: z.array(idSchema).max(200),
  /** `true` : suit le master. `false` : fige le contenu dans `snapshot`. */
  linked: z.boolean(),
  snapshot: masterContentSchema.nullable(),
  overrides: overridesSchema,
});

export const participantStateDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("participant"),
  userId: idSchema,
  instanceId: idSchema,
  currentStepId: idSchema.nullable(),
  openElement: z.object({ type: z.enum(["resource", "app"]), id: idSchema }).nullable(),
  /** État propre à l'appareil/app (position de défilement…) ; jamais interprété par le serveur. */
  appViewState: z.record(z.string(), z.unknown()),
  deviceId: z.string().max(64),
});

export const noteDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("note"),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("instance") }),
    z.object({ type: z.literal("step"), stepId: idSchema }),
  ]),
  body: z.string().max(20_000),
  flag: z.enum(["good", "improve", "bookmark"]).optional(),
});

export const submissionDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("submission"),
  stepId: idSchema,
  status: z.enum(["draft", "submitted", "needs_help", "accepted"]),
  selfAssessment: z.number().int().min(1).max(4).optional(),
  comments: z.array(z.object({ authorId: idSchema, body: z.string().max(5_000), at: epoch })).max(200),
});

/** Journal de recherche : codes neutres (`step.complete`), jamais de texte localisé (ADR 0007). */
export const eventDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("event"),
  instanceId: idSchema,
  action: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/),
  object: z.string().max(100).optional(),
  meta: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  initiatedBy: z.enum(["user", "system"]),
});

/* ---- états des applications ---- */

export const timerStateDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("timerstate"),
  appId: idSchema,
  status: z.enum(["idle", "running", "paused", "done"]),
  /** Temps restant au moment `startedAtMs` (ou en pause). */
  remainingMs: z.number().int().nonnegative(),
  /** Heure SERVEUR (epoch ms) du démarrage ; voir `timerRemainingMs`. */
  startedAtMs: epoch.nullable(),
});

export const kanbanCardDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("kanbancard"),
  appId: idSchema,
  columnId: z.string().min(1).max(40),
  title: z.string().max(300),
  points: z.number().int().min(0).max(100).optional(),
  order: orderKeySchema,
});

/** Texte collaboratif : mises à jour Yjs en ajout seul (spike c). */
export const yUpdateDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("yupdate"),
  appId: idSchema,
  form: z.enum(["update", "snapshot"]),
  update: z.string().max(1_000_000),
});

export const formAnswerDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("formanswer"),
  appId: idSchema,
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean()])),
  submitted: z.boolean(),
});

export const instanceScopedDocSchema = z.discriminatedUnion("kind", [
  instanceDocSchema,
  participantStateDocSchema,
  noteDocSchema,
  submissionDocSchema,
  eventDocSchema,
  timerStateDocSchema,
  kanbanCardDocSchema,
  yUpdateDocSchema,
  formAnswerDocSchema,
]);

/* ------------------------------------------------------------------ types */

export type ActivityDoc = z.infer<typeof activityDocSchema>;
export type StepDoc = z.infer<typeof stepDocSchema>;
export type ResourceDoc = z.infer<typeof resourceDocSchema>;
export type AppDoc = z.infer<typeof appDocSchema>;
export type MasterDoc = z.infer<typeof masterDocSchema>;
export type StepPatch = z.infer<typeof stepPatchSchema>;
export type Overrides = z.infer<typeof overridesSchema>;
export type MasterContent = z.infer<typeof masterContentSchema>;
export type InstanceDoc = z.infer<typeof instanceDocSchema>;
export type ParticipantStateDoc = z.infer<typeof participantStateDocSchema>;
export type NoteDoc = z.infer<typeof noteDocSchema>;
export type SubmissionDoc = z.infer<typeof submissionDocSchema>;
export type EventDoc = z.infer<typeof eventDocSchema>;
export type TimerStateDoc = z.infer<typeof timerStateDocSchema>;
export type KanbanCardDoc = z.infer<typeof kanbanCardDocSchema>;
export type YUpdateDoc = z.infer<typeof yUpdateDocSchema>;
export type FormAnswerDoc = z.infer<typeof formAnswerDocSchema>;
export type InstanceScopedDoc = z.infer<typeof instanceScopedDocSchema>;
