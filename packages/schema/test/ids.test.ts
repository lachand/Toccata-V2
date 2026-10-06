import { describe, expect, it } from "vitest";
import { idSchema, instanceDbName, masterDbName, newId } from "../src";

describe("identifiants", () => {
  it("ont 22 caractères en minuscules valides", () => {
    for (let i = 0; i < 200; i++) expect(idSchema.safeParse(newId()).success).toBe(true);
  });
  it("sont triables dans le temps", () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    const c = newId(1_800_000_000_000);
    expect([c, b, a].sort()).toEqual([a, b, c]);
  });
  it("ne collisionnent pas sur 20 000 tirages dans la même milliseconde", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(newId(1_700_000_000_000));
    expect(seen.size).toBe(20_000);
  });
  it("refusent un horodatage invalide", () => {
    expect(() => newId(-1)).toThrow(RangeError);
    expect(() => newId(1.5)).toThrow(RangeError);
  });
  it("rejettent majuscules, caractères exclus et mauvaise longueur", () => {
    for (const bad of ["", "ABC", newId().toUpperCase(), newId().slice(1), newId() + "0", newId().replace(/.$/, "u"), newId().replace(/.$/, "i")]) {
      expect(idSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("produisent des noms de base CouchDB valides", () => {
    const couchName = /^[a-z][a-z0-9_$()+/-]*$/;
    const id = newId();
    expect(masterDbName(id)).toMatch(couchName);
    expect(instanceDbName(id)).toMatch(couchName);
  });
});
