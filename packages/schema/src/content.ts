import {
  activityDocSchema,
  appDocSchema,
  instanceDocSchema,
  instanceScopedDocSchema,
  masterDocSchema,
  resourceDocSchema,
  stepDocSchema,
  teacherNoteDocSchema,
  type TeacherNoteDoc,
  type InstanceDoc,
  type InstanceScopedDoc,
  type MasterContent,
  type MasterDoc,
} from "./entities";

export type DecodeIssue = Readonly<{ id: string; reason: "invalid" }>;

/**
 * Décode des documents bruts (issus de RxDB / de la réplication). Un document invalide est écarté
 * et signalé : la base peut contenir n'importe quoi (version plus ancienne, écriture hors règle),
 * l'application ne doit jamais s'arrêter pour autant.
 */
function decodeAll<T>(raw: readonly unknown[], parse: (x: unknown) => { success: true; data: T } | { success: false }): { docs: T[]; issues: DecodeIssue[] } {
  const docs: T[] = [];
  const issues: DecodeIssue[] = [];
  for (const r of raw) {
    const p = parse(r);
    if (p.success) docs.push(p.data);
    else issues.push({ id: typeof r === "object" && r && "id" in r ? String((r as { id: unknown }).id) : "?", reason: "invalid" });
  }
  return { docs, issues };
}

export const decodeMasterDocs = (raw: readonly unknown[]) => decodeAll<MasterDoc>(raw, (x) => masterDocSchema.safeParse(x));
export const decodeTeacherDocs = (raw: readonly unknown[]) => decodeAll<TeacherNoteDoc>(raw, (x) => teacherNoteDocSchema.safeParse(x));
export const decodeInstanceDocs = (raw: readonly unknown[]) => decodeAll<InstanceScopedDoc>(raw, (x) => instanceScopedDocSchema.safeParse(x));

/**
 * Rassemble les documents d'une base `master_<id>` en un contenu. `null` tant que le document
 * d'activité n'est pas arrivé (réplication en cours).
 */
export function assembleContent(docs: readonly MasterDoc[]): MasterContent | null {
  const activity = docs.find((d) => activityDocSchema.safeParse(d).success);
  if (!activity || activity.kind !== "activity") return null;
  return {
    activity,
    steps: docs.filter((d) => stepDocSchema.safeParse(d).success) as MasterContent["steps"],
    resources: docs.filter((d) => resourceDocSchema.safeParse(d).success) as MasterContent["resources"],
    apps: docs.filter((d) => appDocSchema.safeParse(d).success) as MasterContent["apps"],
  };
}

/** Le document `instance` d'une base `inst_<id>` (le plus récent s'il y en a plusieurs). */
export function findInstanceDoc(docs: readonly InstanceScopedDoc[]): InstanceDoc | null {
  const all = docs.filter((d): d is InstanceDoc => instanceDocSchema.safeParse(d).success);
  return all.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1))[0] ?? null;
}

/** Clé d'ordre entre deux voisines (`null` = bord de la liste). Insertion sans renumérotation (indexation fractionnaire). */
export { generateKeyBetween as orderBetween } from "fractional-indexing";
