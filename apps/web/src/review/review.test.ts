import { emptyOverrides, type AppDoc, type InstanceDoc, type InstanceScopedDoc, type MasterContent, type StepDoc } from "@toccata/schema";
import { describe, expect, it } from "vitest";
import { buildReview } from "./review";

const id = (n: number) => String(n).padStart(22, "0");
const OWNER = id(1);
const [S1, S2, S3] = [id(11), id(12), id(13)];
const [A, B, C] = [id(21), id(22), id(23)];
const T0 = 1_700_000_000_000;

const step = (sid: string, order: string, extra: Partial<StepDoc> = {}): StepDoc => ({ id: sid, kind: "step", activityId: id(2), title: `Étape ${order}`, instructions: "", order, hidden: false, locked: false, blockedByAppId: null, createdAt: 1, updatedAt: 1, ...extra });
const timer = (sid: string, sec: number, n: number) => ({ id: id(30 + n), kind: "app", type: "timer", name: "Chrono", scope: { type: "step", stepId: sid }, config: { durationSec: sec }, createdAt: 1, updatedAt: 1 }) as unknown as AppDoc;
const content: MasterContent = { activity: { id: id(2), kind: "activity", ownerId: OWNER, title: "A", description: "", createdAt: 1, updatedAt: 1 }, steps: [step(A, "a0"), step(B, "a1"), step(C, "a2")], resources: [], apps: [timer(A, 600, 1), timer(B, 300, 2)] };
const def = (n: number, members: string[], extra: Partial<InstanceDoc> = {}): InstanceDoc => ({ id: id(40 + n), authorId: OWNER, kind: "instance", masterId: id(2), name: `Groupe ${n}`, memberIds: members, linked: true, snapshot: null, overrides: emptyOverrides(), createdAt: 1, updatedAt: 1, ...extra });
let n = 100;
const ev = (authorId: string, action: string, at: number, object?: string, meta?: Record<string, string | number | boolean>) => ({ id: id(n++), authorId, kind: "event", instanceId: id(41), action, ...(object ? { object } : {}), ...(meta ? { meta } : {}), initiatedBy: "user", createdAt: T0 + at * 1000, updatedAt: T0 + at * 1000 }) as unknown as InstanceScopedDoc;

describe("prévu vs réalisé", () => {
  it("sans journal : le prévu seul, rien d'inventé", () => {
    const r = buildReview(content, [{ def: def(1, [S1]), docs: [] }]);
    expect(r).toMatchObject({ eventCount: 0, startedAt: null, endedAt: null, plannedTotalSec: 900 });
    expect(r.steps.map((s) => [s.plannedSec, s.observedSec, s.groupsReached])).toEqual([[600, null, 0], [300, null, 0], [null, null, 0]]);
  });

  it("temps observé : de chaque entrée à la suivante, médiane des membres puis des groupes", () => {
    const g1 = [ev(S1, "step.enter", 0, A), ev(S1, "step.enter", 420, B), ev(S1, "step.enter", 720, C), ev(S2, "step.enter", 0, A), ev(S2, "step.enter", 600, B)];
    const g2 = [ev(S3, "step.enter", 0, A), ev(S3, "step.enter", 300, B)];
    const r = buildReview(content, [{ def: def(1, [S1, S2]), docs: g1 }, { def: def(2, [S3]), docs: g2 }]);
    // groupe 1, étape A : membres 420 s et 600 s → médiane 510 ; groupe 2 : 300 s ; médiane des groupes (510, 300) = 405
    expect(r.steps[0]).toMatchObject({ observedSec: 405, plannedSec: 600, groupsReached: 2, groupsTotal: 2 });
    expect(r.steps[1]!.observedSec).toBe(300); // seul S1 a quitté B (300 s) ; S2 y est resté, sans fin inventée
    expect(r.steps[2]).toMatchObject({ observedSec: null, groupsReached: 1 }); // dernière étape : pas de fin connue
    expect(r.groups.map((g) => g.stepsReached)).toEqual([3, 2]);
  });

  it("revenir sur une étape cumule le temps ; le journal d'un autre groupe ne compte pas", () => {
    const docs = [ev(S1, "step.enter", 0, A), ev(S1, "step.enter", 100, B), ev(S1, "step.enter", 150, A), ev(S1, "step.enter", 250, B), ev(id(99), "step.enter", 0, A), ev(id(99), "step.enter", 9999, B)];
    expect(buildReview(content, [{ def: def(1, [S1]), docs }]).steps[0]!.observedSec).toBe(200);
  });

  it("compte aides, remises (dernière valeur par élève), modifications en direct et variantes", () => {
    const docs = [
      ev(S1, "submission.needs_help", 10, A),
      ev(S1, "submission.submitted", 20, A),
      ev(S2, "submission.submitted", 20, A),
      ev(S2, "submission.cleared", 30, A),
      ev(OWNER, "edit.apply", 40, A, { type: "setStepHidden" }),
      ev(OWNER, "edit.apply", 41, B, { type: "patchStep" }),
    ];
    const variant = def(1, [S1, S2], { overrides: { ...emptyOverrides(), steps: { [B]: { hidden: true } } } });
    const r = buildReview(content, [{ def: variant, docs }, { def: def(2, [S3]), docs: [] }]);
    expect(r.steps[0]).toMatchObject({ helpRequests: 1, completions: 1, liveEdits: 1, variantGroups: 0 });
    expect(r.steps[1]).toMatchObject({ liveEdits: 1, variantGroups: 1 }); // masquée pour un seul des deux groupes
    expect(r.groups[0]).toMatchObject({ helpRequests: 1 });
  });

  it("additionne les prolongations de chrono par groupe, et borne la séance par la première et la dernière trace", () => {
    const docs = [ev(OWNER, "timer.extend", 5, A, { ms: 60_000 }), ev(OWNER, "timer.extend", 50, A, { ms: 300_000 }), ev(S1, "step.enter", 100, A)];
    const r = buildReview(content, [{ def: def(1, [S1]), docs }]);
    expect(r.groups[0]!.timerExtensionsSec).toBe(360);
    expect(r).toMatchObject({ startedAt: T0 + 5_000, endedAt: T0 + 100_000, eventCount: 3 });
  });
});
