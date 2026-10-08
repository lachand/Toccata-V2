import type { InstanceDoc, InstanceScopedDoc } from "@toccata/schema";

export type ResearchRow = {
  timestamp: string;
  group: string;
  actor: string;
  role: "teacher" | "student" | "unknown";
  action: string;
  object: string;
  initiatedBy: string;
  meta: string;
};

export const RESEARCH_COLUMNS: (keyof ResearchRow)[] = ["timestamp", "group", "actor", "role", "action", "object", "initiatedBy", "meta"];

type Ev = { authorId: string; action: string; object?: string; meta?: Record<string, unknown>; initiatedBy?: string; createdAt: number };

/**
 * Journal de recherche : codes d'action neutres, personnes pseudonymisées (P01… dans l'ordre d'apparition de cet export, T pour
 * l'enseignant), groupes G1…, aucun nom ni contenu produit par les élèves. Les pseudonymes ne sont valables que dans un export.
 */
export function buildResearchRows(groups: { def: InstanceDoc; docs: InstanceScopedDoc[] }[]): ResearchRow[] {
  const rows: (ResearchRow & { at: number })[] = [];
  const pseudo = new Map<string, string>();
  const nameOf = (id: string, owner: string): string => {
    if (id === owner) return "T";
    let p = pseudo.get(id);
    if (!p) pseudo.set(id, (p = `P${String(pseudo.size + 1).padStart(2, "0")}`));
    return p;
  };
  const sorted = groups.map((g) => ({ ...g, events: g.docs.filter((d) => d.kind === "event").map((d) => d as unknown as Ev).sort((a, b) => a.createdAt - b.createdAt) }));
  sorted.forEach((g, i) => {
    const members = new Set(g.def.memberIds);
    for (const e of g.events) {
      const role = e.authorId === g.def.authorId ? "teacher" : members.has(e.authorId) ? "student" : null;
      if (!role) continue; // trace d'un tiers : jamais exportée
      rows.push({ at: e.createdAt, timestamp: new Date(e.createdAt).toISOString(), group: `G${i + 1}`, actor: nameOf(e.authorId, g.def.authorId), role, action: e.action, object: e.object ?? "", initiatedBy: e.initiatedBy ?? "user", meta: e.meta ? JSON.stringify(e.meta) : "" });
    }
  });
  return rows.sort((a, b) => a.at - b.at).map(({ at: _at, ...r }) => r);
}

/** Neutralise l'interprétation d'une cellule comme formule par un tableur (injection CSV). */
const cell = (v: string): string => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows: ResearchRow[]): string {
  return [RESEARCH_COLUMNS.join(","), ...rows.map((r) => RESEARCH_COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export function toJson(rows: ResearchRow[]): string {
  return JSON.stringify({ format: "toccata-research-log", version: 1, columns: RESEARCH_COLUMNS, events: rows }, null, 2);
}
