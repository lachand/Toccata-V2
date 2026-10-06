// Vérifie le contraste des paires de jetons (WCAG 2.2 AA) ; échoue si une paire est insuffisante.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");
const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [premier plan, arrière-plan, minimum, usage]
const TEXT = 4.5;
const UI = 3;
const pairs = [
  ["fg", "bg", TEXT, "texte sur fond"],
  ["fg", "surface", TEXT, "texte sur carte"],
  ["fg", "surface-2", TEXT, "texte sur surface secondaire"],
  ["muted", "bg", TEXT, "texte atténué sur fond"],
  ["muted", "surface", TEXT, "texte atténué sur carte"],
  ["muted", "surface-2", TEXT, "texte atténué sur surface secondaire"],
  ["accent", "surface", TEXT, "lien / texte d'accent sur carte"],
  ["accent", "bg", TEXT, "lien / texte d'accent sur fond"],
  ["accent-ink", "accent-soft", TEXT, "texte d'accent sur pastille"],
  ["accent-ink", "surface", TEXT, "texte d'accent sur carte"],
  ["accent-fg", "accent", TEXT, "bouton principal"],
  ["accent-fg", "accent-hover", TEXT, "bouton principal survolé"],
  ["ok-ink", "ok-soft", TEXT, "pastille ok"],
  ["warn-ink", "warn-soft", TEXT, "pastille attention"],
  ["crit-ink", "crit-soft", TEXT, "pastille critique"],
  ["ok-ink", "surface", TEXT, "texte ok sur carte"],
  ["ok", "surface", UI, "icône ok sur carte"],
  ["warn-ink", "surface", TEXT, "texte attention sur carte"],
  ["warn", "surface", UI, "icône attention sur carte"],
  ["crit-ink", "surface", TEXT, "texte critique sur carte"],
  ["crit", "surface", UI, "icône critique sur carte"],
  ["surface", "g1", TEXT, "initiales d'avatar groupe 1"],
  ["surface", "g2", TEXT, "initiales d'avatar groupe 2"],
  ["surface", "g3", TEXT, "initiales d'avatar groupe 3"],
  ["surface", "g4", TEXT, "initiales d'avatar groupe 4"],
  ["line-strong", "surface", UI, "contour de champ sur carte"],
  ["line-strong", "bg", UI, "contour de champ sur fond"],
  ["accent", "surface", UI, "anneau de focus"],
];

let failed = 0;
for (const [fg, bg, min, use] of pairs) {
  if (!tokens[fg] || !tokens[bg]) {
    console.error(`✗ jeton manquant : ${fg} ou ${bg}`);
    failed++;
    continue;
  }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${fg} sur ${bg} — ${use}`);
}
if (failed) {
  console.error(`\n${failed} paire(s) sous le seuil WCAG AA.`);
  process.exit(1);
}
