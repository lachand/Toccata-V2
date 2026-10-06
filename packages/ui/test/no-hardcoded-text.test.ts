import { parse } from "@babel/parser";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou i18n (ADR 0007) : ce paquet est neutre en langue. Aucun texte visible ni nom accessible en dur.
const DIR = join(import.meta.dirname, "../src/components");
const ATTRS = new Set(["aria-label", "aria-description", "aria-roledescription", "title", "alt", "placeholder"]);

type Node = { type: string; [k: string]: unknown };

export function violationsIn(file: string, code: string): string[] {
  const ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as Node;
    const line = (node.loc as { start: { line: number } } | undefined)?.start.line ?? 0;
    if (node.type === "JSXText" && /\p{L}/u.test(String(node.value))) out.push(`${file}:${line} texte JSX en dur : ${JSON.stringify(String(node.value).trim())}`);
    if (node.type === "JSXAttribute") {
      const name = (node.name as { name?: string }).name;
      const value = node.value as Node | null;
      if (name && ATTRS.has(name) && value?.type === "StringLiteral") out.push(`${file}:${line} attribut ${name} en dur : ${String(value.value)}`);
    }
    for (const [k, v] of Object.entries(node)) if (k !== "loc" && k !== "tokens") visit(v);
  };
  visit(ast.program);
  return out;
}

describe("aucun texte en dur dans packages/ui", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
  it("trouve des composants à contrôler", () => expect(files.length).toBeGreaterThan(3));
  for (const f of files) it(f, () => expect(violationsIn(f, readFileSync(join(DIR, f), "utf8"))).toEqual([]));

  it("le contrôle détecte bien un texte en dur (test du test)", () => {
    const v = violationsIn("x.tsx", `const A = () => <button aria-label="Fermer">Valider</button>;`);
    expect(v).toHaveLength(2);
    expect(violationsIn("y.tsx", `const A = ({t}) => <button aria-label={t}>{t}<b /></button>;`)).toEqual([]);
  });
});
