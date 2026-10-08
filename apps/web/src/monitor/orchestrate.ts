import { applyToOverrides, decodeInstanceDocs, newId, timerRemainingMs, type BroadcastDoc, type FeedbackDoc, type InstanceDoc, type MasterContent, type TimerStateDoc } from "@toccata/schema";
import type { Workspace } from "../data/workspace";

/**
 * Micro-orchestration (article §7) : les gestes de l'enseignant pendant la séance. Chacun s'écrit comme un document ou une
 * surcharge de l'INSTANCE visée : les élèves le voient arriver par la réplication, sans rien recharger. Toutes ces écritures
 * sont réservées au propriétaire (règle CouchDB `owner_only` pour consignes et retours).
 */

type Ctx = { ws: Workspace; ownerId: string };

const rows = async (ws: Workspace, instanceId: string) => decodeInstanceDocs((await (await ws.instanceCol(instanceId)).find().exec()).map((r) => r.toJSON())).docs;
const newest = <T extends { updatedAt: number }>(docs: T[]) => [...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0];

export type TimerChange = { type: "extend"; ms: number } | { type: "reset" };

/** Prolonge ou réinitialise un chronomètre partagé. Calculé avec l'heure serveur estimée, comme les élèves. */
export async function adjustTimer({ ws, ownerId }: Ctx, instanceId: string, appId: string, fullMs: number, change: TimerChange): Promise<void> {
  const col = await ws.instanceCol(instanceId);
  const cur = newest((await rows(ws, instanceId)).filter((d): d is TimerStateDoc => d.kind === "timerstate" && d.appId === appId));
  const now = ws.serverNow();
  const base = cur ?? { status: "idle" as const, remainingMs: fullMs, startedAtMs: null };
  const remaining = timerRemainingMs(base, now);
  let next: Pick<TimerStateDoc, "status" | "remainingMs" | "startedAtMs">;
  if (change.type === "reset") next = { status: "idle", remainingMs: fullMs, startedAtMs: null };
  else if (base.status === "running" && remaining > 0) next = { status: "running", remainingMs: remaining + change.ms, startedAtMs: now }; // il continue de tourner
  else next = { status: "paused", remainingMs: remaining + change.ms, startedAtMs: null }; // arrêté ou fini : on rend du temps, les élèves relancent
  const t = ws.now();
  const doc: TimerStateDoc = { id: cur?.id ?? newId(t), authorId: cur?.authorId ?? ownerId, kind: "timerstate", appId, createdAt: cur?.createdAt ?? t, updatedAt: t, ...next };
  await col.upsert(doc as unknown as Record<string, unknown>);
}

/** Message affiché en bandeau, ou demande d'attention qui fige les écrans ; `active: false` la lève. Un document par mode. */
export async function setBroadcast({ ws, ownerId }: Ctx, instanceId: string, mode: BroadcastDoc["mode"], body: string, active: boolean): Promise<void> {
  const col = await ws.instanceCol(instanceId);
  const cur = newest((await rows(ws, instanceId)).filter((d): d is BroadcastDoc => d.kind === "broadcast" && d.authorId === ownerId && d.mode === mode));
  const t = ws.now();
  const doc: BroadcastDoc = { id: cur?.id ?? newId(t), authorId: ownerId, teacherOnly: true, kind: "broadcast", mode, body, active, createdAt: cur?.createdAt ?? t, updatedAt: t };
  await col.upsert(doc as unknown as Record<string, unknown>);
}

/** Retour de l'enseignant sur une étape (un document par étape) : commentaire et acceptation. */
export async function saveFeedback({ ws, ownerId }: Ctx, instanceId: string, stepId: string, patch: Partial<Pick<FeedbackDoc, "body" | "accepted">>): Promise<void> {
  const col = await ws.instanceCol(instanceId);
  const cur = newest((await rows(ws, instanceId)).filter((d): d is FeedbackDoc => d.kind === "feedback" && d.authorId === ownerId && d.stepId === stepId));
  const t = ws.now();
  const doc: FeedbackDoc = { id: cur?.id ?? newId(t), authorId: ownerId, teacherOnly: true, kind: "feedback", stepId, body: patch.body ?? cur?.body ?? "", accepted: patch.accepted ?? cur?.accepted ?? false, createdAt: cur?.createdAt ?? t, updatedAt: t };
  await col.upsert(doc as unknown as Record<string, unknown>);
}

/** Verrouille ou déverrouille une étape pour UN groupe (surcharge de son instance, le script commun ne bouge pas). */
export async function setStepLockedFor(ws: Workspace, instanceId: string, stepId: string, locked: boolean, content: MasterContent): Promise<void> {
  await ws.updateInstanceDef(instanceId, (d: InstanceDoc) => ({ ...d, overrides: applyToOverrides(d.overrides, { type: "setStepLocked", stepId, locked }, d.linked ? content : (d.snapshot ?? content)) }));
}
