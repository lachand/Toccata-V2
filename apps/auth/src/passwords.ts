import { hash, verify, type Algorithm } from "@node-rs/argon2";

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

/** Mot de passe d'enseignant : 12 caractères au moins, et pas simplement répété. */
export function passwordProblem(password: string, username: string): "too_short" | "too_simple" | "contains_username" | null {
  if ([...password].length < 12) return "too_short";
  if (new Set(password).size < 5) return "too_simple";
  if (username.length >= 4 && password.toLowerCase().includes(username.toLowerCase())) return "contains_username";
  return null;
}
