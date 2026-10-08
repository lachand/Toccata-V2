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
  /** Préfixe public de l'API (le proxy y envoie `/api/*` vers ce service) : évite toute collision avec les routes de l'interface. */
  BASE_PATH: z.string().regex(/^(\/[a-z0-9-]+)+$/).default("/api"),
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
  /** Inscription ouverte à tous, sans code. Fermée par défaut : à n'activer qu'en connaissance de cause. */
  OPEN_SIGNUP: bool(false),
  /** `local` : serveur de classe (Raspberry Pi, mini-PC), copie filtrée d'un serveur amont. `cloud` : le serveur de référence. */
  SERVER_MODE: z.enum(["cloud", "local"]).default("cloud"),
  /** Nom affiché dans l'indicateur de l'interface (« Serveur de classe »…). */
  SERVER_NAME: z.string().min(1).max(60).default("Toccata"),
  /** Mode local : CouchDB amont (le cloud), vu DEPUIS le CouchDB local, et son compte d'administration. */
  UPSTREAM_COUCHDB_URL: z.url().optional(),
  UPSTREAM_ADMIN_USER: z.string().min(1).optional(),
  UPSTREAM_ADMIN_PASSWORD: z.string().min(1).optional(),
  /** Mode local : adresse testée pour savoir si l'amont est joignable (par défaut `UPSTREAM_COUCHDB_URL` ; utile si le service et CouchDB ne voient pas le réseau de la même façon). */
  UPSTREAM_PROBE_URL: z.url().optional(),
  /** Mode local : adresse du CouchDB local vue de lui-même (celle que le réplicateur utilise pour la source). */
  LOCAL_COUCHDB_SELF_URL: z.url().default("http://127.0.0.1:5984"),
  /** Mode local : enseignants servis (identifiants séparés par des virgules). Seuls leurs comptes et leurs activités sont copiés. */
  TEACHER_IDS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  /** Période de la passe de rapprochement (provisionnement et réplication), en secondes. */
  RECONCILE_SECONDS: z.coerce.number().int().min(2).max(3600).default(30),
}).superRefine((c, ctx) => {
  if (c.SERVER_MODE !== "local") return;
  for (const k of ["UPSTREAM_COUCHDB_URL", "UPSTREAM_ADMIN_USER", "UPSTREAM_ADMIN_PASSWORD"] as const) if (!c[k]) ctx.addIssue({ code: "custom", path: [k], message: "requis en mode local" });
  if (c.TEACHER_IDS.length === 0) ctx.addIssue({ code: "custom", path: ["TEACHER_IDS"], message: "requis en mode local (au moins un enseignant)" });
  for (const id of c.TEACHER_IDS) if (!/^[0-9a-hjkmnp-tv-z]{22}$/.test(id)) ctx.addIssue({ code: "custom", path: ["TEACHER_IDS"], message: "identifiant d'enseignant invalide" });
});

export type Config = z.infer<typeof schema>;

/** Valide l'environnement. Lève une erreur lisible (sans jamais afficher de valeur) si quelque chose manque. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // docker compose transmet `VAR=` (chaîne vide) pour une variable non renseignée : on la traite comme absente
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const r = schema.safeParse(clean);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".")} : ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join("\n")}`);
  }
  return r.data;
}
