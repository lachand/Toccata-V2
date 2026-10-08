// @vitest-environment node
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { firstValueFrom } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, resolve, type BroadcastDoc, type FeedbackDoc, type TimerStateDoc } from "@toccata/schema";
import { Workspace } from "../data/workspace";
import { adjustTimer, saveFeedback, setBroadcast, setStepLockedFor } from "./orchestrate";

const opened: Workspace[] = [];
afterEach(async () => void (await Promise.all(opened.splice(0).map((w) => w.close()))));

async function setup() {
  const owner = newId();
  const w = await Workspace.open({ userId: owner, storage: getRxStorageMemory() as never, multiInstance: false });
  opened.push(w);
  const act = newId();
  const inst = newId();
  await w.createActivity(act, owner, "A", "fr");
  const s1 = await w.addStep(act, "Un");
  const s2 = await w.addStep(act, "Deux");
  await w.createInstanceDef(inst, act, owner, "Groupe", [newId()]);
  const docs = async () => await firstValueFrom(w.instanceDocs$(inst));
  return { w, owner, act, inst, s1, s2, docs, ctx: { ws: w, ownerId: owner } };
}

describe("micro-orchestration", () => {
  it("prolonge un chrono qui tourne sans l'arrêter, et rend du temps à un chrono fini ou arrêté", async () => {
    const { w, inst, ctx, docs } = await setup();
    const app = newId();
    const store = w.instanceStore(inst, { id: newId(), role: "student" });
    const t0 = w.serverNow();
    await store.put({ kind: "timerstate", appId: app, status: "running", remainingMs: 60_000, startedAtMs: t0 });
    await adjustTimer(ctx, inst, app, 60_000, { type: "extend", ms: 300_000 });
    let st = (await docs()).find((d): d is TimerStateDoc => d.kind === "timerstate")!;
    expect(st.status).toBe("running");
    expect(st.remainingMs).toBeGreaterThan(355_000); // ≈ 60 s + 300 s, repartis depuis maintenant
    expect(st.remainingMs).toBeLessThanOrEqual(360_000);
    expect((await docs()).filter((d) => d.kind === "timerstate")).toHaveLength(1); // le même document

    await store.put({ kind: "timerstate", id: st.id, appId: app, status: "running", remainingMs: 1_000, startedAtMs: t0 - 120_000 }); // fini depuis longtemps
    await adjustTimer(ctx, inst, app, 60_000, { type: "extend", ms: 60_000 });
    st = (await docs()).find((d): d is TimerStateDoc => d.kind === "timerstate")!;
    expect(st).toMatchObject({ status: "paused", remainingMs: 60_000, startedAtMs: null });

    await adjustTimer(ctx, inst, app, 90_000, { type: "reset" });
    expect((await docs()).find((d): d is TimerStateDoc => d.kind === "timerstate")).toMatchObject({ status: "idle", remainingMs: 90_000 });
  });

  it("crée l'état du chrono s'il n'existe pas encore", async () => {
    const { inst, ctx, docs } = await setup();
    await adjustTimer(ctx, inst, newId(), 120_000, { type: "extend", ms: 60_000 });
    expect((await docs()).find((d) => d.kind === "timerstate")).toMatchObject({ status: "paused", remainingMs: 180_000 });
  });

  it("un seul document par mode de diffusion : on le met à jour, puis on le lève", async () => {
    const { inst, ctx, docs, owner } = await setup();
    await setBroadcast(ctx, inst, "message", "Cinq minutes !", true);
    await setBroadcast(ctx, inst, "message", "Deux minutes !", true);
    await setBroadcast(ctx, inst, "attention", "", true);
    let b = (await docs()).filter((d): d is BroadcastDoc => d.kind === "broadcast");
    expect(b).toHaveLength(2);
    expect(b.find((x) => x.mode === "message")).toMatchObject({ body: "Deux minutes !", active: true, authorId: owner, teacherOnly: true });
    await setBroadcast(ctx, inst, "attention", "", false);
    b = (await docs()).filter((d): d is BroadcastDoc => d.kind === "broadcast");
    expect(b.find((x) => x.mode === "attention")!.active).toBe(false);
  });

  it("enregistre un retour par étape, qu'on peut compléter puis accepter", async () => {
    const { inst, ctx, docs, s1, s2 } = await setup();
    await saveFeedback(ctx, inst, s1, { body: "Presque" });
    await saveFeedback(ctx, inst, s1, { accepted: true });
    await saveFeedback(ctx, inst, s2, { body: "À revoir" });
    const f = (await docs()).filter((d): d is FeedbackDoc => d.kind === "feedback");
    expect(f).toHaveLength(2);
    expect(f.find((x) => x.stepId === s1)).toMatchObject({ body: "Presque", accepted: true });
  });

  it("verrouille une étape pour un seul groupe : le script commun et les autres groupes ne bougent pas", async () => {
    const { w, act, owner, inst, s2 } = await setup();
    const other = newId();
    await w.createInstanceDef(other, act, owner, "Autre", [newId()]);
    const content = (await firstValueFrom(w.content$(act)))!;
    await setStepLockedFor(w, inst, s2, true, content);
    const defA = (await firstValueFrom(w.instance$(inst, owner)))!;
    const defB = (await firstValueFrom(w.instance$(other, owner)))!;
    expect(resolve(content, defA, { role: "student" }).steps.find((s) => s.id === s2)!.locked).toBe(true);
    expect(resolve(content, defB, { role: "student" }).steps.find((s) => s.id === s2)!.locked).toBe(false);
    expect(content.steps.find((s) => s.id === s2)!.locked).toBe(false);
  });
});
