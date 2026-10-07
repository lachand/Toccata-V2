import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as en from "@zxcvbn-ts/language-en";
import * as fr from "@zxcvbn-ts/language-fr";

// `Algorithm` est un `const enum` (inutilisable avec isolatedModules) : Argon2id vaut 2.
const ARGON2ID = 2 as Algorithm;

/** Argon2id, paramètres minimaux recommandés par l'OWASP (19 Mio, 2 itérations, 1 voie). */
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Les mots de passe d'enseignant sont normalisés en NFC : la même saisie donne le même haché sur tous les claviers. */
export const normalizePassword = (password: string): string => password.normalize("NFC");

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

/**
 * Hachage factice : sert à vérifier un mot de passe contre « quelque chose » quand l'identifiant est
 * inconnu, pour que le temps de réponse ne révèle pas si un compte existe.
 */
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword("toccata-dummy-password-never-valid"));

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) {
    await verify(await dummyHash(), password).catch(() => false);
    return false;
  }
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

const fold = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

let strength: ZxcvbnFactory | null = null;
const strengthChecker = () =>
  (strength ??= new ZxcvbnFactory({ translations: en.translations, graphs: common.adjacencyGraphs, dictionary: { ...common.dictionary, ...en.dictionary, ...fr.dictionary } }));

export type PasswordProblem = "too_short" | "too_simple" | "contains_username" | "too_common";

/**
 * Mot de passe d'enseignant : 12 caractères au moins, pas répété, sans l'identifiant, et d'une force estimée
 * suffisante (zxcvbn, dictionnaires français et anglais, score 4 sur 4 : « motdepasse2024!! » ou « Azerty123456! » ne passent pas). Ce dernier contrôle réduit
 * l'attaque « horizontale » (un mot de passe courant essayé sur de nombreux comptes) ; il ne la supprime pas.
 */
export function passwordProblem(password: string, username: string, userInputs: readonly string[] = []): PasswordProblem | null {
  if ([...password].length < 12) return "too_short";
  if (new Set(password).size < 5) return "too_simple";
  // l'identifiant ou un mot du nom affiché (4 lettres et plus) ne doit pas figurer dans le mot de passe
  const personal = [username, ...userInputs.flatMap((x) => x.split(/\s+/))].map(fold).filter((x) => x.length >= 4);
  const folded = fold(password);
  if (personal.some((x) => folded.includes(x))) return "contains_username";
  if (strengthChecker().check(password.slice(0, 100), personal).score < 4) return "too_common";
  return null;
}
