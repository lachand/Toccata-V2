import { emptyOverrides, type AppDoc, type InstanceDoc, type InstanceScopedDoc, type MasterContent, type StepDoc } from "@toccata/schema";
import { describe, expect, it } from "vitest";
import { byUrgency, summarizeGroup } from "./summary";

const id = (n: number) => String(n).padStart(22, "0");
const OWNER = id(1);
const [S1, S2, S3] = [id(11), id(12), id(13)];
const [ST1, ST2, ST3] = [id(21), id(22), id(23)];
const [TIMER, KANBAN, FORM] = [id(31), id(32), id(33)];
const T0 = 1_700_000_000_000;

const step = (sid: string, order: string, extra: Partial<StepDoc> = {}): StepDoc => ({ id: sid, kind: "step", activityId: id(2), title: `Étape ${order}`, instructions: "", order, hidden: false, locked: false, blockedByAppId: null, createdAt: 1, updatedAt: 1, ...extra });
const app = (a: Record<string, unknown>) => ({ kind: "app", scope: { type: "activity" }, createdAt: 1, updatedAt: 1, ...a }) as unknown as AppDoc;

const content: MasterContent = {
  activity: { id: id(2), kind: "activity", ownerId: OWNER, title: "A", description: "", createdAt: 1, updatedAt: 1 },
  steps: [step(ST1, "a0"), step(ST2, "a1"), step(ST3, "a2", { hidden: true })],
  resources: [],
  apps: [
    app({ id: TIMER, type: "timer", name: "Chrono", config: { durationSec: 600 } }),
    app({ id: KANBAN, type: "kanban", name: "Tableau", config: { columns: [{ id: "todo", title: "À faire" }, { id: "done", title: "Fait" }] } }),
    app({ id: FORM, type: "form", name: "Quiz", config: { fields: [], blocking: false } }),
  ],
};
const def: InstanceDoc = { id: id(3), authorId: OWNER, kind: "instance", masterId: id(2), name: "Groupe A", memberIds: [S1, S2, S3], linked: true, snapshot: null, overrides: emptyOverrides(), createdAt: 1, updatedAt: 1 };

let n = 100;
const doc = (d: Record<string, unknown>) => ({ id: id(n++), authorId: S1, teacherOnly: undefined, createdAt: T0, updatedAt: T0, ...d }) as unknown as InstanceScopedDoc;
const participant = (userId: string, stepId: string | null) => doc({ id: userId, kind: "participant", authorId: userId, userId, instanceId: def.id, currentStepId: stepId, openElement: null, appViewState: {}, deviceId: "d" });

describe("résumé d'un groupe", () => {
  it("un groupe vide : personne n'a commencé", () => {
    const s = summarizeGroup(content, def, [], T0);
    expect(s).toMatchObject({ stepIndex: null, stepId: null, lastActivity: null, help: [], stepCount: 2 }); // l'étape masquée n'existe pas pour l'élève
    expect(s.members.every((m) => m.stepIndex === null)).toBe(true);
    expect(s.timers[0]).toMatchObject({ status: "idle", remainingMs: 600_000 });
  });

  it("l'étape du groupe est celle du membre le plus avancé ; une étape supprimée ou masquée ne compte pas", () => {
    const s = summarizeGroup(content, def, [participant(S1, ST1), participant(S2, ST2), participant(S3, ST3)], T0);
    expect(s.members.map((m) => m.stepIndex)).toEqual([0, 1, null]);
    expect(s).toMatchObject({ stepIndex: 1, stepId: ST2 });
  });

  it("calcule le chrono avec l'heure serveur, et le passe à « terminé » à zéro", () => {
    const running = doc({ kind: "timerstate", appId: TIMER, status: "running", remainingMs: 600_000, startedAtMs: T0 });
    expect(summarizeGroup(content, def, [running], T0 + 120_000).timers[0]).toMatchObject({ status: "running", remainingMs: 480_000 });
    expect(summarizeGroup(content, def, [running], T0 + 700_000).timers[0]).toMatchObject({ status: "done", remainingMs: 0 });
    const paused = doc({ kind: "timerstate", appId: TIMER, status: "paused", remainingMs: 90_000, startedAtMs: null, updatedAt: T0 + 5 });
    expect(summarizeGroup(content, def, [running, paused], T0 + 999_999).timers[0]).toMatchObject({ status: "paused", remainingMs: 90_000 }); // le plus récent fait foi
  });

  it("compte les cartes par colonne, les orphelines dans la première", () => {
    const card = (columnId: string) => doc({ kind: "kanbancard", appId: KANBAN, columnId, title: "c", order: "a0" });
    const k = summarizeGroup(content, def, [card("todo"), card("done"), card("done"), card("supprimee")], T0).kanban[0]!;
    expect(k.columns.map((c) => c.count)).toEqual([2, 2]);
    expect(k.total).toBe(4);
  });

  it("compte les questionnaires envoyés par personne, sur la dernière réponse", () => {
    const ans = (authorId: string, submitted: boolean, updatedAt: number) => doc({ kind: "formanswer", appId: FORM, authorId, answers: {}, submitted, updatedAt });
    const f = summarizeGroup(content, def, [ans(S1, true, 1), ans(S1, false, 2), ans(S2, true, 1), ans(id(99), true, 1)], T0).forms[0]!;
    expect(f).toMatchObject({ submitted: 1, total: 3 }); // S1 est revenu en brouillon, l'inconnu ne compte pas
  });

  it("repère les demandes d'aide, et les lève quand l'enseignant a répondu", () => {
    const sub = (authorId: string, status: string, updatedAt: number) => doc({ kind: "submission", authorId, stepId: ST1, status, updatedAt });
    const fb = (updatedAt: number) => doc({ kind: "feedback", authorId: OWNER, teacherOnly: true, stepId: ST1, body: "Regarde la consigne", accepted: false, updatedAt });
    expect(summarizeGroup(content, def, [sub(S1, "needs_help", 10)], T0).help).toEqual([{ userId: S1, stepId: ST1 }]);
    expect(summarizeGroup(content, def, [sub(S1, "needs_help", 10), fb(20)], T0).help).toEqual([]);
    expect(summarizeGroup(content, def, [sub(S1, "needs_help", 30), fb(20)], T0).help).toHaveLength(1); // nouvelle demande après le retour
    expect(summarizeGroup(content, def, [sub(S1, "needs_help", 10), sub(S1, "submitted", 11)], T0)).toMatchObject({ help: [], done: [{ userId: S1, stepId: ST1 }] });
  });

  it("ignore les documents d'auteurs étrangers au groupe, et un faux retour signé d'un élève", () => {
    const stranger = doc({ kind: "submission", authorId: id(77), stepId: ST1, status: "needs_help" });
    const forged = doc({ kind: "feedback", authorId: S2, stepId: ST1, body: "x", accepted: true, updatedAt: T0 + 99 });
    const real = doc({ kind: "submission", authorId: S1, stepId: ST1, status: "needs_help" });
    const s = summarizeGroup(content, def, [stranger, forged, real], T0);
    expect(s.help).toEqual([{ userId: S1, stepId: ST1 }]);
  });

  it("trie les groupes : aide d'abord, puis chrono le plus proche de la fin, puis nom", () => {
    const g = (name: string, help: number, remaining?: number) => ({ ...summarizeGroup(content, def, [], T0), name, help: Array.from({ length: help }, () => ({ userId: S1, stepId: ST1 })), timers: remaining === undefined ? [] : [{ appId: TIMER, name: "c", status: "running" as const, remainingMs: remaining }] });
    const sorted = [g("B", 0), g("A", 0, 500), g("C", 1), g("D", 0, 100)].sort(byUrgency).map((x) => x.name);
    expect(sorted).toEqual(["C", "D", "A", "B"]);
  });
});
