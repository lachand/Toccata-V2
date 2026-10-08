import { resolve, timerRemainingMs, type AppDoc, type InstanceDoc, type InstanceScopedDoc, type MasterContent } from "@toccata/schema";

export type TimerSummary = Readonly<{ appId: string; name: string; status: "idle" | "running" | "paused" | "done"; remainingMs: number }>;
export type KanbanSummary = Readonly<{ appId: string; name: string; columns: readonly { id: string; title: string; count: number }[]; total: number }>;
export type FormSummary = Readonly<{ appId: string; name: string; submitted: number; total: number }>;
export type Help = Readonly<{ userId: string; stepId: string }>;

export type GroupSummary = Readonly<{
  instanceId: string;
  name: string;
  memberIds: readonly string[];
  stepCount: number;
  /** Étape la plus avancée parmi les membres (indice dans le script de l'élève), `null` si personne n'a commencé. */
  stepIndex: number | null;
  stepId: string | null;
  stepTitle: string | null;
  /** Étape suivante du script de ce groupe (`null` : dernière), et si elle est verrouillée pour lui. */
  nextStepId: string | null;
  nextLocked: boolean;
  /** Étape en cours de chaque membre (`null` : n'a rien ouvert). */
  members: readonly { userId: string; stepIndex: number | null }[];
  timers: readonly TimerSummary[];
  kanban: readonly KanbanSummary[];
  forms: readonly FormSummary[];
  /** Demandes d'aide en attente : dernière remise « besoin d'aide » sans retour de l'enseignant depuis. */
  help: readonly Help[];
  /** Étapes terminées par au moins un membre (dernière remise `submitted`). */
  done: readonly { userId: string; stepId: string }[];
  /** Dernière écriture d'un membre (epoch ms), `null` si aucune. */
  lastActivity: number | null;
}>;

const latest = <T extends { updatedAt: number; id: string }>(docs: readonly T[]): T | undefined => [...docs].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : -1))[0];

function groupBy<T>(docs: readonly T[], key: (d: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const d of docs) {
    const k = key(d);
    const list = m.get(k);
    if (list) list.push(d);
    else m.set(k, [d]);
  }
  return m;
}

/**
 * Résumé d'un groupe pour l'écran de suivi : fonction pure. `now` est l'heure SERVEUR estimée (le minuteur ne dépend
 * jamais de l'horloge de l'appareil). Seuls les documents des membres comptent (et ceux de l'enseignant pour ses retours) :
 * un document venu d'ailleurs ne peut pas fausser le tableau de bord.
 */
export function summarizeGroup(content: MasterContent, def: InstanceDoc, docs: readonly InstanceScopedDoc[], now: number): GroupSummary {
  const members = new Set(def.memberIds);
  const mine = docs.filter((d) => members.has(d.authorId) || d.authorId === content.activity.ownerId);
  const resolved = resolve(content, def, { role: "student" });
  const steps = resolved.steps;
  const indexOf = (stepId: string | null) => (stepId === null ? -1 : steps.findIndex((s) => s.id === stepId));

  // où en est chacun
  const participants = mine.filter((d): d is Extract<InstanceScopedDoc, { kind: "participant" }> => d.kind === "participant" && members.has(d.userId) && d.authorId === d.userId);
  const memberRows = def.memberIds.map((userId) => {
    const p = participants.find((x) => x.userId === userId);
    const i = p ? indexOf(p.currentStepId) : -1;
    return { userId, stepIndex: i >= 0 ? i : null };
  });
  const best = memberRows.reduce<number | null>((acc, m) => (m.stepIndex !== null && (acc === null || m.stepIndex > acc) ? m.stepIndex : acc), null);

  const apps: AppDoc[] = [...resolved.activityApps, ...steps.flatMap((s) => s.apps)];

  const timers: TimerSummary[] = apps.filter((a) => a.type === "timer").map((a) => {
    const st = latest(mine.filter((d): d is Extract<InstanceScopedDoc, { kind: "timerstate" }> => d.kind === "timerstate" && d.appId === a.id));
    const full = (a.type === "timer" ? a.config.durationSec : 0) * 1000;
    const base = st ?? { status: "idle" as const, remainingMs: full, startedAtMs: null };
    const remaining = timerRemainingMs(base, now);
    return { appId: a.id, name: a.name, status: base.status === "running" && remaining === 0 ? "done" : base.status, remainingMs: remaining };
  });

  const cards = mine.filter((d): d is Extract<InstanceScopedDoc, { kind: "kanbancard" }> => d.kind === "kanbancard");
  const kanban: KanbanSummary[] = apps.flatMap((a) => {
    if (a.type !== "kanban") return [];
    const own = cards.filter((c) => c.appId === a.id);
    const known = new Set(a.config.columns.map((c) => c.id));
    const first = a.config.columns[0]!.id;
    const columns = a.config.columns.map((c) => ({ id: c.id, title: c.title, count: own.filter((x) => (known.has(x.columnId) ? x.columnId : first) === c.id).length }));
    return [{ appId: a.id, name: a.name, columns, total: own.length }];
  });

  const answers = mine.filter((d): d is Extract<InstanceScopedDoc, { kind: "formanswer" }> => d.kind === "formanswer");
  const forms: FormSummary[] = apps.filter((a) => a.type === "form").map((a) => {
    const sent = new Set<string>();
    for (const [author, list] of groupBy(answers.filter((x) => x.appId === a.id), (x) => x.authorId)) if (latest(list)?.submitted) sent.add(author);
    return { appId: a.id, name: a.name, submitted: [...sent].filter((u) => members.has(u)).length, total: def.memberIds.length };
  });

  const submissions = mine.filter((d): d is Extract<InstanceScopedDoc, { kind: "submission" }> => d.kind === "submission");
  const feedback = mine.filter((d): d is Extract<InstanceScopedDoc, { kind: "feedback" }> => d.kind === "feedback" && d.authorId === content.activity.ownerId);
  const help: Help[] = [];
  const done: { userId: string; stepId: string }[] = [];
  for (const list of groupBy(submissions, (s) => `${s.authorId}\u0000${s.stepId}`).values()) {
    const s = latest(list)!;
    if (!members.has(s.authorId)) continue;
    const answered = feedback.some((f) => f.stepId === s.stepId && f.updatedAt >= s.updatedAt);
    if (s.status === "needs_help" && !answered) help.push({ userId: s.authorId, stepId: s.stepId });
    if (s.status === "submitted" || s.status === "accepted") done.push({ userId: s.authorId, stepId: s.stepId });
  }

  const memberDocs = mine.filter((d) => members.has(d.authorId));
  const lastActivity = memberDocs.length ? Math.max(...memberDocs.map((d) => d.updatedAt)) : null;
  const stepAt = best === null ? undefined : steps[best];
  return {
    instanceId: def.id,
    name: def.name,
    memberIds: def.memberIds,
    stepCount: steps.length,
    stepIndex: best,
    stepId: stepAt?.id ?? null,
    stepTitle: stepAt?.title ?? null,
    nextStepId: steps[(best ?? -1) + 1]?.id ?? null,
    nextLocked: steps[(best ?? -1) + 1]?.locked ?? false,
    members: memberRows,
    timers,
    kanban,
    forms,
    help,
    done,
    lastActivity,
  };
}

/** Ordre d'affichage : d'abord les groupes qui demandent de l'aide, puis ceux dont le chrono est le plus proche de la fin, puis par nom. */
export function byUrgency(a: GroupSummary, b: GroupSummary): number {
  if (a.help.length !== b.help.length) return b.help.length - a.help.length;
  const t = (g: GroupSummary) => Math.min(Infinity, ...g.timers.filter((x) => x.status === "running").map((x) => x.remainingMs));
  if (t(a) !== t(b)) return t(a) - t(b);
  return a.name.localeCompare(b.name);
}
