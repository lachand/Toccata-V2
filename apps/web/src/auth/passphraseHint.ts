/**
 * Garde anti-faute de frappe pour les phrases de passe d'élève (6 mots de la liste BIP-39).
 * Pas de somme de contrôle côté serveur (ADR 0009) : le client signale un mot inconnu avant l'envoi,
 * ce qui évite de brûler l'un des essais autorisés. Les listes sont chargées à la demande.
 */
const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

export const fold = (s: string): string[] =>
  strip(s)
    .toLowerCase()
    .split(/[\s_.-]+/)
    .filter(Boolean);

let words: Promise<Set<string>> | null = null;
function loadWords(): Promise<Set<string>> {
  words ??= Promise.all([import("@scure/bip39/wordlists/french.js"), import("@scure/bip39/wordlists/english.js")]).then(
    ([fr, en]) => new Set([...fr.wordlist, ...en.wordlist].map((w) => strip(w).toLowerCase())),
  );
  return words;
}

export function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

export interface PassphraseHint {
  typed: string;
  suggestion: string | null;
}

/** `null` si le texte ne ressemble pas à une phrase de passe d'élève, ou si tous ses mots sont connus. */
export async function checkPassphrase(input: string): Promise<PassphraseHint | null> {
  const tokens = fold(input);
  if (tokens.length < 5 || tokens.length > 8) return null;
  const dict = await loadWords();
  const unknown = tokens.filter((w) => !dict.has(w));
  // la plupart des mots doivent être connus, sinon c'est un mot de passe ordinaire (enseignant)
  if (unknown.length === 0 || unknown.length > Math.floor(tokens.length / 3)) return null;
  const typed = unknown[0]!;
  let best: string | null = null;
  let bestD = 3;
  for (const w of dict) {
    if (Math.abs(w.length - typed.length) > 2) continue;
    const d = distance(typed, w);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return { typed, suggestion: best };
}
