import { describe, expect, it } from "vitest";
import { appDocSchema, emptyOverrides, instanceScopedDocSchema, masterDocSchema, overridesSchema, resourceDocSchema, stepDocSchema, newId } from "../src";
import { makeInstance, makeKanban, makeResource, makeStep, makeTimer } from "./factories";

const id = () => newId();

describe("schémas", () => {
  it("acceptent des documents valides", () => {
    const a = id();
    expect(masterDocSchema.safeParse(makeStep(id(), a, "a0")).success).toBe(true);
    expect(masterDocSchema.safeParse(makeResource(id(), { type: "activity" })).success).toBe(true);
    expect(masterDocSchema.safeParse(makeTimer(id(), { type: "activity" })).success).toBe(true);
    expect(instanceScopedDocSchema.safeParse(makeInstance(id(), a, id())).success).toBe(true);
    expect(overridesSchema.safeParse(emptyOverrides()).success).toBe(true);
  });

  describe("URLs (sécurité)", () => {
    const res = (url: string) => resourceDocSchema.safeParse(makeResource(id(), { type: "activity" }, { source: { type: "url", url, display: "iframe" } }));
    it("n'acceptent que https", () => {
      expect(res("https://fr.wikipedia.org/wiki/Accueil").success).toBe(true);
      for (const bad of ["http://example.org", "javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://example.org", "//example.org", "pas une url"]) {
        expect(res(bad).success, bad).toBe(false);
      }
    });
    it("limite la longueur", () => {
      expect(res("https://example.org/" + "a".repeat(2100)).success).toBe(false);
    });
  });

  it("refuse une clé de fichier qui n'est pas un hash sha-256", () => {
    const f = (fileId: string) => resourceDocSchema.safeParse(makeResource(id(), { type: "activity" }, { source: { type: "file", fileId, mime: "image/png", size: 10 } }));
    expect(f("file_" + "a".repeat(64)).success).toBe(true);
    expect(f("file_xyz").success).toBe(false);
    expect(f("a".repeat(64)).success).toBe(false);
  });

  it("valide la config selon le type d'application", () => {
    const base = makeTimer(id(), { type: "activity" });
    expect(appDocSchema.safeParse({ ...base, config: { durationSec: 0 } }).success).toBe(false);
    expect(appDocSchema.safeParse({ ...base, config: { durationSec: 90_000 } }).success).toBe(false);
    expect(appDocSchema.safeParse({ ...base, type: "kanban", config: { durationSec: 5 } }).success).toBe(false);
    expect(appDocSchema.safeParse({ ...makeKanban(id(), { type: "activity" }), config: { columns: [] } }).success).toBe(false);
    expect(appDocSchema.safeParse({ ...base, type: "inconnue" }).success).toBe(false);
    expect(appDocSchema.safeParse({ ...base, type: "external", config: { url: "http://x.org", display: "iframe" } }).success).toBe(false);
  });

  it("exige une portée d'étape avec identifiant", () => {
    expect(resourceDocSchema.safeParse(makeResource(id(), { type: "step" } as never)).success).toBe(false);
  });

  it("impose l'auteur sur les documents d'instance", () => {
    const { authorId: _omit, ...sans } = makeInstance(id(), id(), id());
    expect(instanceScopedDocSchema.safeParse(sans).success).toBe(false);
  });

  it("rejette les codes d'action de journal localisés ou libres", () => {
    const ev = (action: string) =>
      instanceScopedDocSchema.safeParse({ id: id(), authorId: id(), createdAt: 1, updatedAt: 1, kind: "event", instanceId: id(), action, initiatedBy: "user" });
    expect(ev("step.complete").success).toBe(true);
    expect(ev("app.timer_start").success).toBe(true);
    expect(ev("Étape terminée").success).toBe(false);
    expect(ev("complete").success).toBe(false);
  });

  it("rejette les champs de mauvais type", () => {
    expect(stepDocSchema.safeParse({ ...makeStep(id(), id(), "a0"), hidden: "oui" }).success).toBe(false);
    expect(stepDocSchema.safeParse({ ...makeStep(id(), id(), "a0"), order: "" }).success).toBe(false);
  });
});
