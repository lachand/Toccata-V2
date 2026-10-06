import { z } from "zod";

const secret = z
  .string()
  .min(1, "manquant")
  .transform((s, ctx) => {
    const buf = Buffer.from(s, "base64");
    if (buf.byteLength < 32) {
      ctx.addIssue({ code: "custom", message: "au moins 32 octets une fois décodé (base64)" });
      return z.NEVER;
    }
    return buf;
  });

const bool = (def: boolean) =>
  z
    .enum(["true", "false"])
    .default(def ? "true" : "false")
    .transform((v) => v === "true");

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  COUCHDB_URL: z.url(),
  COUCHDB_ADMIN_USER: z.string().min(1),
  COUCHDB_ADMIN_PASSWORD: z.string().min(1),
  ACCOUNTS_DB: z.string().regex(/^[a-z][a-z0-9_]*$/).default("toccata_accounts"),
  /** Clé HMAC partagée avec CouchDB (`[jwt_keys] hmac:<kid>`), en base64. Aucune valeur par défaut. */
  JWT_SECRET: secret,
  JWT_KID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default("k1"),
  ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** `false` seulement en développement sans HTTPS. */
  COOKIE_SECURE: bool(true),
  /** Origine autorisée (CORS) quand l'interface est servie depuis une autre origine (développement). */
  ALLOWED_ORIGIN: z.url().optional(),
  /** À `true` derrière un proxy de confiance : l'IP du client est lue dans `X-Forwarded-For`. */
  TRUST_PROXY: bool(false),
  /** Si défini, l'inscription d'un enseignant exige ce code (à distribuer par l'établissement). */
  SIGNUP_CODE: z.string().min(8).optional(),
});

export type Config = z.infer<typeof schema>;

/** Valide l'environnement. Lève une erreur lisible (sans jamais afficher de valeur) si quelque chose manque. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".")} : ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join("\n")}`);
  }
  return r.data;
}
