import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { Config } from "./config";

export const ISSUER = "toccata-auth";

export type AccessClaims = { sub: string; role: "teacher" | "student"; couchRoles: string[] };

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(["teacher", "student"]),
  _couchdb: z.object({ roles: z.array(z.string()) }),
});

/** Jeton d'accès : JWT HS256 court, lu par CouchDB (`_couchdb.roles` imbriquée : une clé plate n'est pas lue). */
export async function mintAccessToken(cfg: Pick<Config, "JWT_SECRET" | "JWT_KID" | "ACCESS_TTL_SECONDS">, c: AccessClaims, nowMs = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({ role: c.role, _couchdb: { roles: c.couchRoles } })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: cfg.JWT_KID })
    .setSubject(c.sub)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + cfg.ACCESS_TTL_SECONDS)
    .sign(cfg.JWT_SECRET);
}

export async function verifyAccessToken(cfg: Pick<Config, "JWT_SECRET">, token: string, nowMs = Date.now()): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, cfg.JWT_SECRET, { algorithms: ["HS256"], issuer: ISSUER, currentDate: new Date(nowMs), requiredClaims: ["exp", "sub"] });
    const p = claimsSchema.safeParse(payload);
    return p.success ? { sub: p.data.sub, role: p.data.role, couchRoles: p.data._couchdb.roles } : null;
  } catch {
    return null;
  }
}

/** Jeton de rafraîchissement : `<identifiant de session>.<secret>`, 256 bits d'aléa ; seul le haché est stocké. */
export function newRefreshSecret(): string {
  return randomBytes(32).toString("base64url");
}
export const hashSecret = (secret: string): string => createHash("sha256").update(secret).digest("base64url");

export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
