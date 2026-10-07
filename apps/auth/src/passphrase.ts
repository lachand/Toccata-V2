import { wordlist as english } from "@scure/bip39/wordlists/english.js";
import { wordlist as french } from "@scure/bip39/wordlists/french.js";
import type { RandomBytes } from "@toccata/schema";

export type Lang = "fr" | "en";
const LISTS: Record<Lang, readonly string[]> = { fr: french, en: english };
const defaultRandom: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Entier uniforme dans [0, max) par rejet : aucun biais de modulo. */
function uniform(max: number, random: RandomBytes): number {
  const limit = Math.floor(0x10000 / max) * max;
  for (;;) {
    const [a, b] = random(2) as unknown as [number, number];
    const v = (a << 8) | b;
    if (v < limit) return v % max;
  }
}

/** Nombre de mots d'une phrase de passe d'élève : 6 × 11 bits = 66 bits (4 mots n'en donnaient que 44, trop peu en cas de fuite de la base). */
export const PASSPHRASE_WORDS = 6;

/** Phrase de passe de 6 mots tirés d'une liste de 2048 mots (66 bits), sans accents, séparés par un tiret. */
export function generatePassphrase(lang: Lang, random: RandomBytes = defaultRandom, words = PASSPHRASE_WORDS): string {
  const list = LISTS[lang];
  return Array.from({ length: words }, () => strip(list[uniform(list.length, random)]!)).join("-");
}

export const PASSPHRASE_BITS = (words = PASSPHRASE_WORDS) => words * Math.log2(2048);

const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Forme canonique d'une phrase de passe d'élève : sans accents, en minuscules, mots séparés par un tiret.
 * La liste française BIP-39 est en Unicode décomposé : un élève qui tape « débattre » au clavier (forme
 * composée) ne retrouverait jamais la valeur générée. On affiche donc des mots sans accent et on accepte
 * à la connexion toute graphie (accents, majuscules, espaces au lieu de tirets).
 */
export const foldPassphrase = (s: string): string =>
  strip(s)
    .toLowerCase()
    .trim()
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .join("-");

/** `Lina Aubert` → `lina.a` ; vide ou illisible → `eleve`. Les doublons sont départagés par l'appelant. */
export function baseUsername(displayName: string): string {
  const parts = strip(displayName)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return "eleve";
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first!.slice(0, 20)}.${last[0]}` : first!.slice(0, 20);
}
