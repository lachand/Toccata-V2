import { emptyOverrides, type InstanceDoc, type InstanceScopedDoc } from "@toccata/schema";
import { describe, expect, it } from "vitest";
import { buildResearchRows, toCsv, toJson } from "./research";

const id = (n: number) => String(n).padStart(22, "0");
const OWNER = id(1);
const def: InstanceDoc = { id: id(40), authorId: OWNER, kind: "instance", masterId: id(2), name: "Les Dupont", memberIds: [id(11), id(12)], linked: true, snapshot: null, overrides: emptyOverrides(), createdAt: 1, updatedAt: 1 };
let n = 100;
const ev = (a: string, action: string, at: number, extra: object = {}) => ({ id: id(n++), authorId: a, kind: "event", instanceId: def.id, action, initiatedBy: "user", createdAt: at, updatedAt: at, ...extra }) as unknown as InstanceScopedDoc;

describe("journal de recherche", () => {
  const docs = [ev(id(12), "step.enter", 2000, { object: id(21) }), ev(id(11), "step.enter", 1000), ev(OWNER, "timer.extend", 3000, { meta: { ms: 60000 } }), ev(id(99), "step.enter", 500)];
  const rows = buildResearchRows([{ def, docs }]);

  it("pseudonymise, ordonne dans le temps et ignore les traces de tiers", () => {
    expect(rows.map((r) => [r.actor, r.role, r.group])).toEqual([["P01", "student", "G1"], ["P02", "student", "G1"], ["T", "teacher", "G1"]]);
    expect(rows[0]!.timestamp).toBe("1970-01-01T00:00:01.000Z");
    expect(JSON.stringify(rows)).not.toContain("Dupont");
    expect(JSON.stringify(rows)).not.toContain(id(11));
  });

  it("CSV : neutralise les formules et protège guillemets et virgules", () => {
    const csv = toCsv([{ ...rows[0]!, object: "=HYPERLINK(\"x\")", meta: "a,b" }, { ...rows[1]!, object: "-1+1" }]);
    expect(csv).toContain("'=HYPERLINK(\"\"x\"\")");
    expect(csv).toContain('"a,b"');
    expect(csv).toContain("'-1+1");
  });

  it("JSON : format versionné", () => {
    const j = JSON.parse(toJson(rows));
    expect(j).toMatchObject({ format: "toccata-research-log", version: 1 });
    expect(j.events).toHaveLength(3);
  });
});
