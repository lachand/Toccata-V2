import { z } from "zod";

/**
 * Identifiants : 22 caractères en base32 minuscule (alphabet de Crockford, sans i l o u).
 *  - minuscules obligatoires : les noms de bases CouchDB (`master_<id>`) n'acceptent rien d'autre ;
 *  - triables dans le temps : 10 caractères d'horodatage puis 12 d'aléa.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const TIME_LEN = 10;
const RANDOM_LEN = 12;
export const ID_LENGTH = TIME_LEN + RANDOM_LEN;

export const idSchema = z.string().regex(/^[0-9a-hjkmnp-tv-z]{22}$/, "identifiant invalide");
export type Id = z.infer<typeof idSchema>;

export type RandomBytes = (n: number) => Uint8Array;
const defaultRandom: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function newId(now: number = Date.now(), random: RandomBytes = defaultRandom): Id {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError("horodatage invalide");
  let t = now;
  let time = "";
  for (let i = 0; i < TIME_LEN; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rnd = "";
  for (const b of random(RANDOM_LEN)) rnd += ALPHABET[b & 31]; // 256 est divisible par 32 : pas de biais
  return time + rnd;
}

/** Bases CouchDB : une pour le contenu d'une activité, une par instance (ADR 0003). */
export const masterDbName = (id: Id): string => `master_${id}`;
export const instanceDbName = (id: Id): string => `inst_${id}`;

/** Base privée d'un enseignant (notes de préparation et de réflexion) : lisible et inscriptible par lui seul. */
export const teacherDbName = (id: Id): string => `teacher_${id}`;
