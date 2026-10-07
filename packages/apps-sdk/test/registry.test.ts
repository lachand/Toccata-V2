import { describe, expect, it } from "vitest";
import { createRegistry, type AppModule } from "../src";

const fake = (type: "timer" | "text"): AppModule<typeof type> =>
  ({ type, useLabels: () => ({ typeName: type, description: "", defaultName: type }), Icon: () => null, defaultConfig: () => ({}) as never, Runtime: () => null }) as AppModule<typeof type>;

describe("registre d'applications", () => {
  it("enregistre, retrouve et liste dans l'ordre d'enregistrement", () => {
    const r = createRegistry();
    r.register(fake("timer"));
    r.register(fake("text"));
    expect(r.get("timer")?.type).toBe("timer");
    expect(r.get("kanban")).toBeUndefined();
    expect(r.list().map((m) => m.type)).toEqual(["timer", "text"]);
  });

  it("refuse un doublon", () => {
    const r = createRegistry();
    r.register(fake("timer"));
    expect(() => r.register(fake("timer"))).toThrow(/déjà enregistrée/);
  });
});
