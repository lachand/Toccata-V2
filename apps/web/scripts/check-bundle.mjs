// Budget de poids : échoue si le JS chargé au démarrage (entrée de index.html) ou le total dépasse les seuils (gzip).
// Les seuils sont posés légèrement au-dessus de la mesure actuelle : ils servent à empêcher une dérive, pas à fixer un idéal.
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGET = { initialKB: Number(process.env.BUDGET_INITIAL_KB ?? 310), totalKB: Number(process.env.BUDGET_TOTAL_KB ?? 560), cssKB: 12 };
const dist = new URL("../dist/", import.meta.url).pathname;
const gz = (f) => gzipSync(readFileSync(f)).length / 1024;
const html = readFileSync(join(dist, "index.html"), "utf8");
const entries = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const css = [...html.matchAll(/href="\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
const initial = entries.reduce((n, f) => n + gz(join(dist, f)), 0);
const total = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js")).reduce((n, f) => n + gz(join(dist, "assets", f)), 0);
const cssKB = css.reduce((n, f) => n + gz(join(dist, f)), 0);
const rows = [["JS au démarrage", initial, BUDGET.initialKB], ["JS total (toutes pages)", total, BUDGET.totalKB], ["CSS", cssKB, BUDGET.cssKB]];
let fail = false;
for (const [name, v, max] of rows) {
  const ko = v > max;
  fail ||= ko;
  console.log(`${ko ? "✘" : "✔"} ${name} : ${v.toFixed(0)} Ko gzip (budget ${max} Ko)`);
}
process.exit(fail ? 1 : 0);
