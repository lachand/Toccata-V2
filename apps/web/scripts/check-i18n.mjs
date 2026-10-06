// Garde-fou de complétude des traductions (échoue sur toute clé manquante ou incohérente).
// `lingui compile --strict` ne suffit pas : avec une langue de repli, un message vide passe.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import gettextParser from "gettext-parser";

const ROOT = new URL("../src/locales/", import.meta.url).pathname;
const SOURCE = "en";
const SKIP = new Set([SOURCE, "pseudo"]);

const tokens = (s) => [...s.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]|<\/?(\d+)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort().join("|");
let errors = 0;

for (const locale of readdirSync(ROOT).filter((d) => !SKIP.has(d))) {
  const po = gettextParser.po.parse(readFileSync(join(ROOT, locale, "messages.po")));
  const entries = Object.values(po.translations[""] ?? {}).filter((e) => e.msgid);
  for (const e of entries) {
    const str = e.msgstr?.[0] ?? "";
    if (!str.trim()) {
      console.error(`✗ [${locale}] traduction manquante : ${JSON.stringify(e.msgid)}`);
      errors++;
    } else if (/fuzzy/.test(e.comments?.flag ?? "")) {
      console.error(`✗ [${locale}] traduction à relire (fuzzy) : ${JSON.stringify(e.msgid)}`);
      errors++;
    } else if (tokens(e.msgid) !== tokens(str)) {
      console.error(`✗ [${locale}] variables ou balises différentes : ${JSON.stringify(e.msgid)} → ${JSON.stringify(str)}`);
      errors++;
    }
  }
  console.log(`[${locale}] ${entries.length} messages vérifiés`);
}
if (errors) {
  console.error(`\n${errors} problème(s) de traduction.`);
  process.exit(1);
}
