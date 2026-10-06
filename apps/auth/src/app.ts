import { getConnInfo } from "@hono/node-server/conninfo";
import { idSchema, newId, type RandomBytes } from "@toccata/schema";
import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z, type ZodType } from "zod";
import type { AccountStore, Locale, SessionDoc, UserDoc } from "./accounts";
import type { Config } from "./config";
import { ApiError } from "./errors";
import { baseUsername, foldPassphrase, generatePassphrase } from "./passphrase";
import { hashPassword, normalizePassword, passwordProblem, verifyPassword } from "./passwords";
import type { Provisioner } from "./provisioning";
import { RateLimiter } from "./ratelimit";
import { rolesFor } from "./roles";
import { hashSecret, mintAccessToken, newRefreshSecret, secretMatches, verifyAccessToken } from "./tokens";

export type Deps = {
  config: Config;
  accounts: AccountStore;
  provisioner: Provisioner;
  clock?: () => number;
  random?: RandomBytes;
  limits?: { login?: RateLimiter; loginUser?: RateLimiter; signup?: RateLimiter; refresh?: RateLimiter };
};

const REFRESH_COOKIE = "toccata_rt";
/** Une même session rafraîchie deux fois dans cet intervalle (deux onglets) n'est pas une attaque. */
const REUSE_GRACE_MS = 10_000;
const LOCK_AFTER = 5;

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._@+-]{2,63}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const locale = z.enum(["fr", "en"]);

const signupBody = z.object({ username, displayName: text(80), password: z.string().max(200), locale: locale.default("fr"), inviteCode: z.string().max(200).optional() });
const loginBody = z.object({ username: z.string().trim().toLowerCase().max(100), password: z.string().max(200) });
const classBody = z.object({ name: text(80) });
const studentsBody = z.object({ names: z.array(text(80)).min(1).max(60) });
const membersBody = z.object({ memberIds: z.array(idSchema).max(200) });

type Vars = { user: UserDoc };

export function createApp(deps: Deps) {
  const { config, accounts, provisioner } = deps;
  const now = deps.clock ?? Date.now;
  const limits = {
    login: deps.limits?.login ?? new RateLimiter(30, 5 * 60_000, now),
    loginUser: deps.limits?.loginUser ?? new RateLimiter(10, 15 * 60_000, now),
    signup: deps.limits?.signup ?? new RateLimiter(10, 60 * 60_000, now),
    refresh: deps.limits?.refresh ?? new RateLimiter(120, 60_000, now),
  };
  const cookiePath = `${config.BASE_PATH}/auth`; // le navigateur voit l'API sous BASE_PATH ; le cookie doit correspondre
  const app = new Hono<{ Variables: Vars }>();

  app.use(secureHeaders());
  app.use(bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: "invalid_input" }, 413) }));
  if (config.ALLOWED_ORIGIN) app.use(cors({ origin: config.ALLOWED_ORIGIN, credentials: true, allowHeaders: ["authorization", "content-type", "x-requested-with"], allowMethods: ["GET", "POST", "PUT", "DELETE"] }));

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, ...(err.details ?? {}) }, err.status);
    console.error("erreur interne", err instanceof Error ? err.message : "inconnue"); // jamais de corps de requête ni de secret
    return c.json({ error: "internal" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  /* ------------------------------------------------------------------ utilitaires */

  const clientIp = (c: Context): string => {
    if (config.TRUST_PROXY) {
      const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (xff) return xff;
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown"; // hors serveur Node (tests)
    }
  };

  const retry = (ms: number) => new ApiError("rate_limited", { retryAfterSeconds: Math.ceil(ms / 1000) });
  const limit = (l: RateLimiter, key: string) => {
    const wait = l.hit(key);
    if (wait > 0) throw retry(wait);
  };

  async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ApiError("invalid_input");
    }
    const r = schema.safeParse(raw);
    if (!r.success) throw new ApiError("invalid_input", { fields: [...new Set(r.error.issues.map((i) => String(i.path[0] ?? "")))] });
    return r.data;
  }

  const publicUser = (u: UserDoc) => ({ id: u.id, role: u.role, username: u.username, displayName: u.displayName, locale: u.locale });

  async function issue(c: Context, user: UserDoc, familyId?: string) {
    const t = now();
    const sessionId = newId(t, deps.random);
    const secret = newRefreshSecret();
    const session = await accounts.createSession({
      id: sessionId,
      userId: user.id,
      familyId: familyId ?? sessionId,
      tokenHash: hashSecret(secret),
      createdAt: t,
      expiresAt: t + config.REFRESH_TTL_DAYS * 86_400_000,
      usedAt: null,
      revoked: false,
    });
    setCookie(c, REFRESH_COOKIE, `${session.id}.${secret}`, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: "Strict",
      path: cookiePath,
      maxAge: config.REFRESH_TTL_DAYS * 86_400,
    });
    const accessToken = await mintAccessToken(config, { sub: user.id, role: user.role, couchRoles: rolesFor(user) }, t);
    return { accessToken, expiresIn: config.ACCESS_TTL_SECONDS, user: publicUser(user) };
  }

  /** Vérifie le jeton d'accès, puis recharge le compte : un compte supprimé n'agit plus, même avec un jeton encore valide. */
  async function authenticate(c: Context<{ Variables: Vars }>, role?: "teacher"): Promise<UserDoc> {
    const h = c.req.header("authorization");
    const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
    const claims = token ? await verifyAccessToken(config, token, now()) : null;
    if (!claims) throw new ApiError("unauthorized");
    const user = await accounts.getUser(claims.sub);
    if (!user || user.role !== claims.role) throw new ApiError("unauthorized");
    if (role && user.role !== role) throw new ApiError("forbidden");
    c.set("user", user);
    return user;
  }

  const requireHeader = (c: Context) => {
    // Les requêtes inter-sites ne peuvent pas poser cet en-tête sans autorisation CORS préalable.
    if (c.req.header("x-requested-with") !== "toccata") throw new ApiError("forbidden");
  };

  /* ------------------------------------------------------------------ authentification */

  app.post("/auth/teachers", async (c) => {
    limit(limits.signup, clientIp(c));
    const b = await body(c, signupBody);
    if (!config.SIGNUP_CODE && !config.OPEN_SIGNUP) throw new ApiError("signup_closed"); // fermé par défaut
    if (config.SIGNUP_CODE) {
      const given = Buffer.from(b.inviteCode ?? "");
      const want = Buffer.from(config.SIGNUP_CODE);
      if (given.length !== want.length || !timingSafeEqual(given, want)) throw new ApiError("signup_closed");
    }
    const password = normalizePassword(b.password);
    const problem = passwordProblem(password, b.username);
    if (problem) throw new ApiError("weak_password", { reason: problem });
    const user = await accounts.createUser({
      id: newId(now(), deps.random),
      username: b.username,
      displayName: b.displayName,
      role: "teacher",
      passwordHash: await hashPassword(password),
      locale: b.locale,
      memberships: [],
      failedLogins: 0,
      lockedUntil: 0,
      createdAt: now(),
    });
    return c.json(await issue(c, user), 201);
  });

  app.post("/auth/login", async (c) => {
    limit(limits.login, clientIp(c));
    const b = await body(c, loginBody);
    limit(limits.loginUser, b.username);
    const user = await accounts.getUserByUsername(b.username);
    const t = now();
    const locked = !!user && user.lockedUntil > t;
    // On vérifie toujours un mot de passe (haché factice si le compte n'existe pas ou est verrouillé) : temps de réponse uniforme.
    const typed = user?.role === "student" ? foldPassphrase(b.password) : normalizePassword(b.password);
    const ok = await verifyPassword(user && !locked ? user.passwordHash : null, typed);
    if (user && locked) throw new ApiError("locked", { retryAfterSeconds: Math.ceil((user.lockedUntil - t) / 1000) });
    if (!user || !ok) {
      if (user) {
        await accounts.updateUser(user.id, (u) => {
          const failed = u.failedLogins + 1;
          const wait = failed >= LOCK_AFTER ? Math.min(60 * 2 ** (failed - LOCK_AFTER), 3600) * 1000 : 0;
          return { ...u, failedLogins: failed, lockedUntil: wait ? t + wait : 0 };
        });
      }
      throw new ApiError("invalid_credentials");
    }
    limits.loginUser.reset(b.username);
    const fresh = user.failedLogins || user.lockedUntil ? await accounts.updateUser(user.id, (u) => ({ ...u, failedLogins: 0, lockedUntil: 0 })) : user;
    return c.json(await issue(c, fresh));
  });

  app.post("/auth/refresh", async (c) => {
    requireHeader(c);
    limit(limits.refresh, clientIp(c));
    const cookie = getCookie(c, REFRESH_COOKIE);
    const [sid, secret] = cookie?.split(".") ?? [];
    if (!sid || !secret) throw new ApiError("invalid_refresh");
    const session = await accounts.getSession(sid);
    const t = now();
    if (!session || session.revoked || session.expiresAt <= t || !secretMatches(secret, session.tokenHash)) {
      deleteCookie(c, REFRESH_COOKIE, { path: cookiePath });
      throw new ApiError("invalid_refresh");
    }
    // Réutilisation d'un jeton déjà échangé : vol probable, on révoque toute la famille de sessions.
    if (session.usedAt !== null && t - session.usedAt > REUSE_GRACE_MS) {
      await accounts.revokeFamily(session.familyId);
      deleteCookie(c, REFRESH_COOKIE, { path: cookiePath });
      throw new ApiError("refresh_reused");
    }
    const user = await accounts.getUser(session.userId);
    if (!user) {
      await accounts.revokeFamily(session.familyId);
      throw new ApiError("invalid_refresh");
    }
    if (session.usedAt === null) {
      try {
        await accounts.markSessionUsed(session, t);
      } catch {
        // Une autre requête vient d'échanger ce jeton : même situation que ci-dessus, dans la tolérance.
      }
    }
    return c.json(await issue(c, user, session.familyId));
  });

  app.post("/auth/logout", async (c) => {
    requireHeader(c);
    const sid = getCookie(c, REFRESH_COOKIE)?.split(".")[0];
    if (sid) {
      const s = await accounts.getSession(sid);
      if (s) await accounts.revokeFamily(s.familyId);
    }
    deleteCookie(c, REFRESH_COOKIE, { path: cookiePath });
    return c.body(null, 204);
  });

  app.get("/auth/me", async (c) => c.json(publicUser(await authenticate(c))));

  /* ------------------------------------------------------------------ classes (enseignant) */

  const ownClass = async (teacher: UserDoc, id: string) => {
    const cls = idSchema.safeParse(id).success ? await accounts.getClass(id) : null;
    if (!cls || cls.ownerId !== teacher.id) throw new ApiError("not_found"); // 404 aussi pour « pas à vous » : aucune fuite d'existence
    return cls;
  };

  app.post("/classes", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const b = await body(c, classBody);
    const cls = await accounts.createClass({ id: newId(now(), deps.random), name: b.name, ownerId: teacher.id, locale: teacher.locale, studentIds: [], createdAt: now() });
    return c.json({ id: cls.id, name: cls.name }, 201);
  });

  app.get("/classes", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const list = await accounts.listClasses(teacher.id);
    return c.json(list.map((k) => ({ id: k.id, name: k.name, studentCount: k.studentIds.length })));
  });

  app.get("/classes/:id", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const cls = await ownClass(teacher, c.req.param("id"));
    const students = (await Promise.all(cls.studentIds.map((id) => accounts.getUser(id)))).filter((u): u is UserDoc => !!u);
    return c.json({ id: cls.id, name: cls.name, students: students.map((u) => ({ id: u.id, username: u.username, displayName: u.displayName })) });
  });

  /** Crée les comptes élèves. Les phrases de passe ne sont renvoyées qu'ici, une seule fois : seul leur haché est conservé. */
  app.post("/classes/:id/students", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const cls = await ownClass(teacher, c.req.param("id"));
    const b = await body(c, studentsBody);
    const lang: Locale = cls.locale;
    const created: { id: string; username: string; displayName: string; passphrase: string }[] = [];
    for (const displayName of b.names) {
      const passphrase = generatePassphrase(lang, deps.random);
      const passwordHash = await hashPassword(foldPassphrase(passphrase));
      const base = baseUsername(displayName).padEnd(3, "0");
      for (let n = 1; ; n++) {
        const candidate = n === 1 ? base : `${base}${n}`;
        try {
          const u = await accounts.createUser({
            id: newId(now(), deps.random),
            username: candidate,
            displayName,
            role: "student",
            passwordHash,
            locale: lang,
            classId: cls.id,
            createdBy: teacher.id,
            memberships: [],
            failedLogins: 0,
            lockedUntil: 0,
            createdAt: now(),
          });
          created.push({ id: u.id, username: u.username, displayName, passphrase });
          break;
        } catch (e) {
          if (!(e instanceof ApiError && e.code === "username_taken") || n > 999) throw e;
        }
      }
    }
    await accounts.updateClass(cls.id, (k) => ({ ...k, studentIds: [...k.studentIds, ...created.map((s) => s.id)] }));
    return c.json({ students: created }, 201);
  });

  const ownStudent = async (teacher: UserDoc, classId: string, studentId: string) => {
    const cls = await ownClass(teacher, classId);
    const s = cls.studentIds.includes(studentId) ? await accounts.getUser(studentId) : null;
    if (!s || s.role !== "student") throw new ApiError("not_found");
    return { cls, student: s };
  };

  app.post("/classes/:id/students/:sid/reset-password", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const { cls, student } = await ownStudent(teacher, c.req.param("id"), c.req.param("sid"));
    const passphrase = generatePassphrase(cls.locale, deps.random);
    const passwordHash = await hashPassword(foldPassphrase(passphrase));
    await accounts.updateUser(student.id, (u) => ({ ...u, passwordHash, failedLogins: 0, lockedUntil: 0 }));
    await accounts.revokeUserSessions(student.id);
    return c.json({ id: student.id, username: student.username, passphrase });
  });

  app.delete("/classes/:id/students/:sid", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const { cls, student } = await ownStudent(teacher, c.req.param("id"), c.req.param("sid"));
    for (const m of student.memberships) await accounts.updateInstance(m.instanceId, (i) => ({ ...i, memberIds: i.memberIds.filter((x) => x !== student.id) })).catch(() => undefined);
    await accounts.deleteUser(student.id);
    await accounts.updateClass(cls.id, (k) => ({ ...k, studentIds: k.studentIds.filter((x) => x !== student.id) }));
    return c.body(null, 204);
  });

  /* ------------------------------------------------------------------ activités et instances (approvisionnement) */

  app.post("/activities", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const id = newId(now(), deps.random);
    const dbName = await provisioner.provisionMaster(id, [teacher.id]);
    await accounts.createActivity({ id, ownerId: teacher.id, coOwnerIds: [], instanceIds: [], createdAt: now() });
    return c.json({ id, dbName }, 201);
  });

  app.get("/activities", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const list = await accounts.listActivities(teacher.id);
    return c.json(list.map((a) => ({ id: a.id, instanceIds: a.instanceIds })));
  });

  const ownActivity = async (teacher: UserDoc, id: string) => {
    const a = idSchema.safeParse(id).success ? await accounts.getActivity(id) : null;
    if (!a || ![a.ownerId, ...a.coOwnerIds].includes(teacher.id)) throw new ApiError("not_found");
    return a;
  };

  /** Vérifie que chaque identifiant est un élève créé par cet enseignant : on n'inscrit pas n'importe quel compte. */
  const checkStudents = async (teacher: UserDoc, ids: readonly string[]) => {
    const users = await Promise.all(ids.map((id) => accounts.getUser(id)));
    for (const u of users) if (!u || u.role !== "student" || u.createdBy !== teacher.id) throw new ApiError("invalid_input", { fields: ["memberIds"] });
    return users as UserDoc[];
  };

  async function setMembers(teacher: UserDoc, activityId: string, instanceId: string, memberIds: readonly string[]) {
    const unique = [...new Set(memberIds)];
    await checkStudents(teacher, unique);
    const inst = await accounts.getInstance(instanceId);
    if (!inst) throw new ApiError("not_found");
    const before = new Set(inst.memberIds);
    const after = new Set(unique);
    for (const id of before) if (!after.has(id)) await accounts.updateUser(id, (u) => ({ ...u, memberships: u.memberships.filter((m) => m.instanceId !== instanceId) })).catch(() => undefined);
    for (const id of after) if (!before.has(id)) await accounts.updateUser(id, (u) => ({ ...u, memberships: [...u.memberships, { activityId, instanceId }] }));
    await accounts.updateInstance(instanceId, (i) => ({ ...i, memberIds: unique }));
  }

  app.post("/activities/:id/instances", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const act = await ownActivity(teacher, c.req.param("id"));
    const b = await body(c, membersBody.partial());
    await checkStudents(teacher, [...new Set(b.memberIds ?? [])]); // valider AVANT de créer quoi que ce soit : pas d'instance orpheline
    const id = newId(now(), deps.random);
    const owners = [act.ownerId, ...act.coOwnerIds];
    await provisioner.provisionInstance(id, owners);
    await accounts.createInstance({ id, activityId: act.id, memberIds: [], createdAt: now() });
    await accounts.updateActivity(act.id, (a) => ({ ...a, instanceIds: [...a.instanceIds, id] }));
    if (b.memberIds?.length) await setMembers(teacher, act.id, id, b.memberIds);
    return c.json({ id, dbName: `inst_${id}` }, 201);
  });

  app.put("/instances/:id/members", async (c) => {
    const teacher = await authenticate(c, "teacher");
    const inst = idSchema.safeParse(c.req.param("id")).success ? await accounts.getInstance(c.req.param("id")) : null;
    if (!inst) throw new ApiError("not_found");
    await ownActivity(teacher, inst.activityId);
    const b = await body(c, membersBody);
    await setMembers(teacher, inst.activityId, inst.id, b.memberIds);
    return c.json({ memberIds: [...new Set(b.memberIds)] });
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
export type { SessionDoc };
