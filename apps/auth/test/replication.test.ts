import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { accountSelector, contentDbs, REPLICATED_ACCOUNT_TYPES, summarizeUpstream } from "../src/replication";

const base = { COUCHDB_URL: "http://127.0.0.1:5984", COUCHDB_ADMIN_USER: "a", COUCHDB_ADMIN_PASSWORD: "b", JWT_SECRET: Buffer.alloc(32, 1).toString("base64") };
const T = "0t0t0t0t0t0t0t0t0t0t0t";

describe("configuration du mode local", () => {
  it("le mode cloud est le défaut et n'exige aucune variable d'amont", () => {
    expect(loadConfig(base)).toMatchObject({ SERVER_MODE: "cloud", TEACHER_IDS: [] });
  });

  it("le mode local exige l'amont, ses identifiants et au moins un enseignant, sans jamais afficher de valeur", () => {
    expect(() => loadConfig({ ...base, SERVER_MODE: "local" })).toThrow(/UPSTREAM_COUCHDB_URL[\s\S]*TEACHER_IDS/);
    try {
      loadConfig({ ...base, SERVER_MODE: "local", UPSTREAM_COUCHDB_URL: "https://cloud.example", UPSTREAM_ADMIN_USER: "u", UPSTREAM_ADMIN_PASSWORD: "motdepasse-secret", TEACHER_IDS: "pas-un-id" });
    } catch (e) {
      expect(String(e)).toMatch(/identifiant d'enseignant invalide/);
      expect(String(e)).not.toContain("motdepasse-secret");
    }
    const ok = loadConfig({ ...base, SERVER_MODE: "local", UPSTREAM_COUCHDB_URL: "https://cloud.example", UPSTREAM_ADMIN_USER: "u", UPSTREAM_ADMIN_PASSWORD: "p", TEACHER_IDS: ` ${T} , ` });
    expect(ok.TEACHER_IDS).toEqual([T]);
  });
});

describe("réplication vers un serveur de classe", () => {
  it("ne copie jamais les sessions, et filtre par enseignant servi", () => {
    expect(REPLICATED_ACCOUNT_TYPES).not.toContain("session");
    const s = accountSelector([T]) as { type: { $in: string[] }; $or: Record<string, { $in: string[] }>[] };
    expect(s.type.$in).not.toContain("session");
    expect(s.$or).toEqual([{ ownerId: { $in: [T] } }, { createdBy: { $in: [T] } }, { id: { $in: [T] } }]);
  });

  it("liste les bases à répliquer d'après le registre", () => {
    expect(contentDbs({ activities: [{ id: "a1", ownerId: T }], instances: [{ id: "i1" }, { id: "i2" }], teacherIds: [T] })).toEqual(["master_a1", "inst_i1", "inst_i2", `teacher_${T}`]);
  });

  it("l'amont est « en ligne » seulement s'il est joignable et qu'aucune réplication ne tombe en panne", () => {
    expect(summarizeUpstream(true, [{ state: "running" }, { state: "pending" }])).toEqual({ upstream: "online", failing: 0 });
    expect(summarizeUpstream(true, [{ state: "running" }, { state: "crashing" }, { state: "failed" }])).toEqual({ upstream: "offline", failing: 2 });
    expect(summarizeUpstream(false, [{ state: "running" }])).toEqual({ upstream: "offline", failing: 0 });
    expect(summarizeUpstream(true, [])).toEqual({ upstream: "online", failing: 0 });
  });
});
