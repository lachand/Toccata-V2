import { describe, expect, it } from "vitest";
import { reachableCount, resumeIndex, type ProgressStep } from "./progress";

const step = (id: string, o: Partial<ProgressStep> = {}): ProgressStep => ({ id, locked: false, blockedByAppId: null, ...o });
const none = new Set<string>();

describe("progression linéaire", () => {
  it("tout est accessible sans verrou ni blocage", () => {
    expect(reachableCount([step("a"), step("b"), step("c")], none)).toBe(3);
    expect(reachableCount([], none)).toBe(0);
  });

  it("une étape verrouillée ferme le chemin, elle et les suivantes", () => {
    expect(reachableCount([step("a"), step("b", { locked: true }), step("c")], none)).toBe(1);
    expect(reachableCount([step("a", { locked: true }), step("b")], none)).toBe(0);
  });

  it("une étape bloquée par un questionnaire reste accessible mais retient les suivantes jusqu'à l'envoi", () => {
    const steps = [step("a"), step("b", { blockedByAppId: "f1" }), step("c")];
    expect(reachableCount(steps, none)).toBe(2);
    expect(reachableCount(steps, new Set(["f1"]))).toBe(3);
    expect(reachableCount(steps, new Set(["autre"]))).toBe(2);
  });

  it("un verrou après un blocage compte aussi", () => {
    const steps = [step("a", { blockedByAppId: "f" }), step("b", { locked: true })];
    expect(reachableCount(steps, new Set(["f"]))).toBe(1);
  });

  it("reprend où l'on s'était arrêté, sans dépasser ce qui est accessible", () => {
    const steps = [step("a"), step("b"), step("c", { locked: true })];
    expect(resumeIndex(steps, none, "b")).toBe(1);
    expect(resumeIndex(steps, none, "c")).toBe(1); // verrouillée depuis : on revient à la dernière accessible
    expect(resumeIndex(steps, none, "disparue")).toBe(0);
    expect(resumeIndex(steps, none, null)).toBe(0);
    expect(resumeIndex([step("x", { locked: true })], none, null)).toBe(-1);
  });
});
