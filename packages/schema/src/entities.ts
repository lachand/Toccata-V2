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

/** Enveloppe d'un fichier : le contenu est la pièce jointe native `blob` du même document (ADR 0004). */
export const fileIdSchema = z.string().regex(/^file_[0-9a-f]{64}$/);
export const fileDocSchema = z.object({
  id: fileIdSchema,
  kind: z.literal("file"),
  authorId: idSchema,
  mime: z.string().max(127),
  size: z.number().int().nonnegative(),
  createdAt: epoch,
  updatedAt: epoch,
});

export const masterDocSchema = z.union([activityDocSchema, stepDocSchema, resourceDocSchema, appDocSchema, fileDocSchema]);

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
});

/**
 * Retour de l'enseignant sur le travail d'un groupe pour une étape. Document DISTINCT de la remise : la remise
 * appartient à l'élève (qui peut la modifier), le retour appartient à l'enseignant (qu'aucun élève ne peut créer ni changer).
 */
export const feedbackDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("feedback"),
  stepId: idSchema,
  body: z.string().max(5_000),
  accepted: z.boolean(),
});

/**
 * Consigne de pilotage de l'enseignant à un groupe : un message affiché en bandeau, ou une demande d'attention qui fige
 * les écrans. `active:false` la lève. Réservé aux propriétaires (règle CouchDB), comme le retour.
 */
export const broadcastDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("broadcast"),
  mode: z.enum(["message", "attention"]),
  body: z.string().max(500),
  active: z.boolean(),
});

/**
 * Journal de séance (append-only) : codes d'action neutres, jamais de texte localisé (ADR 0007), pour que des exports de classes
 * différentes soient comparables. Ne contient ni nom, ni contenu produit par un élève : identifiants pseudonymes et codes seulement.
 */
export const EVENT_ACTIONS = [
  // élève
  "step.enter",
  "element.open",
  "submission.submitted",
  "submission.needs_help",
  "submission.cleared",
  "self_assessment.set",
  // enseignant
  "group.create",
  "group.members",
  "timer.extend",
  "timer.reset",
  "broadcast.message",
  "broadcast.clear",
  "attention.start",
  "attention.stop",
  "feedback.give",
  "step.lock",
  "step.unlock",
  "edit.apply",
] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

export const eventDocSchema = z.object({
  ...instanceBase,
  kind: z.literal("event"),
  instanceId: idSchema,
  action: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
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

/** Note privée de l'enseignant sur une activité ou une étape (base `teacher_<id>`, jamais lisible par les élèves). */
export const teacherNoteDocSchema = z.object({
  id: idSchema,
  kind: z.literal("tnote"),
  authorId: idSchema,
  activityId: idSchema,
  stepId: idSchema.nullable(),
  body: z.string().max(20_000),
  /** Drapeaux de réflexion (D9) : ce qui a bien marché, à améliorer, à retrouver. */
  flag: z.enum(["good", "improve", "bookmark"]).nullable(),
  createdAt: epoch,
  updatedAt: epoch,
});

export const instanceScopedDocSchema = z.discriminatedUnion("kind", [
  instanceDocSchema,
  participantStateDocSchema,
  noteDocSchema,
  submissionDocSchema,
  feedbackDocSchema,
  broadcastDocSchema,
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
export type FileDoc = z.infer<typeof fileDocSchema>;
export type TeacherNoteDoc = z.infer<typeof teacherNoteDocSchema>;
export type MasterDoc = z.infer<typeof masterDocSchema>;
export type StepPatch = z.infer<typeof stepPatchSchema>;
export type Overrides = z.infer<typeof overridesSchema>;
export type MasterContent = z.infer<typeof masterContentSchema>;
export type InstanceDoc = z.infer<typeof instanceDocSchema>;
export type ParticipantStateDoc = z.infer<typeof participantStateDocSchema>;
export type NoteDoc = z.infer<typeof noteDocSchema>;
export type SubmissionDoc = z.infer<typeof submissionDocSchema>;
export type FeedbackDoc = z.infer<typeof feedbackDocSchema>;
export type BroadcastDoc = z.infer<typeof broadcastDocSchema>;
export type EventDoc = z.infer<typeof eventDocSchema>;
export type TimerStateDoc = z.infer<typeof timerStateDocSchema>;
export type KanbanCardDoc = z.infer<typeof kanbanCardDocSchema>;
export type YUpdateDoc = z.infer<typeof yUpdateDocSchema>;
export type FormAnswerDoc = z.infer<typeof formAnswerDocSchema>;
export type InstanceScopedDoc = z.infer<typeof instanceScopedDocSchema>;
