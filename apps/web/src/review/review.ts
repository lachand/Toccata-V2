import { resolve, type InstanceDoc, type InstanceScopedDoc, type MasterContent } from "@toccata/schema";

export type StepReview = {
  stepId: string;
  title: string;
  plannedSec: number | null;
  observedSec: number | null;
  groupsReached: number;
  groupsTotal: number;
  helpRequests: number;
  completions: number;
  liveEdits: number;
  variantGroups: number;
};

export type GroupReview = {
  instanceId: string;
  name: string;
  stepsReached: number;
  helpRequests: number;
  timerExtensionsSec: number;
};

export type Review = {
  steps: StepReview[];
  groups: GroupReview[];
  startedAt: number | null;
  endedAt: number | null;
  plannedTotalSec: number;
  eventCount: number;
};

type Ev = { authorId: string; action: string; object?: string; meta?: Record<string, unknown>; createdAt: number };

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const eventsOf = (def: InstanceDoc, docs: InstanceScopedDoc[]): Ev[] => {
  const allowed = new Set([...def.memberIds, def.authorId]);
  return docs
    .filter((d) => d.kind === "event" && allowed.has(d.authorId))
    .map((d) => d as unknown as Ev)
    .sort((a, b) => a.createdAt - b.createdAt);
};

/** « Prévu vs réalisé » : fonction pure sur le contenu du master et les journaux d'événements des groupes. */
export function buildReview(content: MasterContent, groups: { def: InstanceDoc; docs: InstanceScopedDoc[] }[]): Review {
  const stepIds = content.steps.map((s) => s.id);
  const planned = new Map<string, number>();
  for (const app of content.apps) {
    if (app.type !== "timer" || app.scope.type !== "step") continue;
    const sec = Number((app.config as { durationSec?: unknown }).durationSec);
    if (Number.isFinite(sec)) planned.set(app.scope.stepId, (planned.get(app.scope.stepId) ?? 0) + sec);
  }

  const perGroupObserved = new Map<string, number[]>(); // étape → temps médian de chaque groupe
  const reached = new Map<string, number>();
  const helps = new Map<string, number>();
  const completions = new Map<string, number>();
  const edits = new Map<string, number>();
  const variants = new Map<string, number>();
  const groupReviews: GroupReview[] = [];
  let all: Ev[] = [];

  for (const { def, docs } of groups) {
    const events = eventsOf(def, docs);
    all = all.concat(events);
    const members = new Set(def.memberIds);

    // temps passé : de chaque entrée dans une étape à l'entrée suivante, par membre
    const memberTimes = new Map<string, number[]>();
    const entered = new Set<string>();
    for (const m of members) {
      const enters = events.filter((e) => e.authorId === m && e.action === "step.enter" && e.object);
      const total = new Map<string, number>();
      enters.forEach((e, i) => {
        entered.add(e.object!);
        const next = enters[i + 1];
        if (next) total.set(e.object!, (total.get(e.object!) ?? 0) + (next.createdAt - e.createdAt) / 1000);
      });
      for (const [sid, sec] of total) memberTimes.set(sid, [...(memberTimes.get(sid) ?? []), sec]);
    }
    for (const [sid, xs] of memberTimes) perGroupObserved.set(sid, [...(perGroupObserved.get(sid) ?? []), median(xs)!]);
    for (const sid of entered) reached.set(sid, (reached.get(sid) ?? 0) + 1);

    // aides, remises (dernière valeur par élève et par étape), modifications en direct
    const last = new Map<string, string>();
    let groupHelps = 0;
    for (const e of events) {
      if (e.action === "submission.needs_help" && e.object) {
        helps.set(e.object, (helps.get(e.object) ?? 0) + 1);
        groupHelps++;
      }
      if (e.action.startsWith("submission.") && e.object && members.has(e.authorId)) last.set(`${e.authorId}|${e.object}`, e.action);
      if (e.action === "edit.apply" && e.object) edits.set(e.object, (edits.get(e.object) ?? 0) + 1);
    }
    for (const [key, action] of last) {
      if (action !== "submission.submitted") continue;
      const sid = key.split("|")[1]!;
      completions.set(sid, (completions.get(sid) ?? 0) + 1);
    }

    // variantes : l'étape résolue pour ce groupe diffère de celle du master
    const resolved = new Map(resolve(content, def, { role: "teacher" }).steps.map((s) => [s.id, s]));
    for (const base of content.steps) {
      const r = resolved.get(base.id);
      if (!r || r.hidden !== base.hidden || r.locked !== base.locked) variants.set(base.id, (variants.get(base.id) ?? 0) + 1);
    }

    groupReviews.push({
      instanceId: def.id,
      name: def.name,
      stepsReached: entered.size,
      helpRequests: groupHelps,
      timerExtensionsSec: events.filter((e) => e.action === "timer.extend").reduce((n, e) => n + Number(e.meta?.ms ?? 0) / 1000, 0),
    });
  }

  const times = all.map((e) => e.createdAt);
  return {
    steps: content.steps.map((s) => ({
      stepId: s.id,
      title: s.title,
      plannedSec: planned.get(s.id) ?? null,
      observedSec: median(perGroupObserved.get(s.id) ?? []),
      groupsReached: reached.get(s.id) ?? 0,
      groupsTotal: groups.length,
      helpRequests: helps.get(s.id) ?? 0,
      completions: completions.get(s.id) ?? 0,
      liveEdits: edits.get(s.id) ?? 0,
      variantGroups: variants.get(s.id) ?? 0,
    })),
    groups: groupReviews,
    startedAt: times.length ? Math.min(...times) : null,
    endedAt: times.length ? Math.max(...times) : null,
    plannedTotalSec: stepIds.reduce((n, id) => n + (planned.get(id) ?? 0), 0),
    eventCount: all.length,
  };
}
