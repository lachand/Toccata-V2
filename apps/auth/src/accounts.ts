import { instanceDbName, type Id } from "@toccata/schema";
import { CouchAdmin, CouchConflict, type Doc } from "./couch";
import { ApiError } from "./errors";
import type { Membership } from "./roles";

export type Locale = "fr" | "en";

export type UserDoc = Doc & {
  type: "user";
  id: Id;
  username: string;
  displayName: string;
  role: "teacher" | "student";
  passwordHash: string;
  locale: Locale;
  classId?: Id;
  createdBy?: Id;
  memberships: Membership[];
  failedLogins: number;
  lockedUntil: number;
  createdAt: number;
};
export type ClassDoc = Doc & { type: "class"; id: Id; name: string; ownerId: Id; locale: Locale; studentIds: Id[]; createdAt: number };
export type SessionDoc = Doc & { type: "session"; id: string; userId: Id; familyId: string; tokenHash: string; createdAt: number; expiresAt: number; usedAt: number | null; revoked: boolean };
/** Les instances d'une activité se déduisent des documents `instance` (`activityId`), jamais d'un tableau modifié des deux côtés (serveur de classe). */
export type ActivityReg = Doc & { type: "activity"; id: Id; ownerId: Id; coOwnerIds: Id[]; createdAt: number };
/** `ownerId` : enseignant propriétaire, pour filtrer la réplication vers un serveur de classe. */
export type InstanceReg = Doc & { type: "instance"; id: Id; activityId: Id; ownerId: Id; memberIds: Id[]; createdAt: number };
type UnameDoc = Doc & { type: "uname"; userId: Id; ownerId: Id };

/** Comptes, classes, sessions et registre des activités, dans une base CouchDB réservée à l'administrateur. */
export class AccountStore {
  constructor(
    private couch: CouchAdmin,
    private db: string,
  ) {}

  async init(): Promise<void> {
    await this.couch.ensureDb(this.db);
    await this.couch.createIndex(this.db, ["type", "familyId"]);
    await this.couch.createIndex(this.db, ["type", "userId"]);
    await this.couch.createIndex(this.db, ["type", "ownerId"]);
    await this.couch.createIndex(this.db, ["type", "activityId"]);
  }

  /* ---------------------------------------------------------------- utilisateurs */

  /** Crée le compte ; l'identifiant de connexion est réservé d'abord (document `uname_…`, unique par construction). */
  async createUser(user: Omit<UserDoc, "_id" | "_rev" | "type">): Promise<UserDoc> {
    const uname: UnameDoc = { _id: `uname_${user.username}`, type: "uname", userId: user.id, ownerId: user.createdBy ?? user.id };
    try {
      await this.couch.put(this.db, uname);
    } catch (e) {
      if (e instanceof CouchConflict) throw new ApiError("username_taken");
      throw e;
    }
    try {
      return await this.couch.put(this.db, { ...user, _id: `user_${user.id}`, type: "user" } as UserDoc);
    } catch (e) {
      const u = await this.couch.get(this.db, uname._id);
      if (u?._rev) await this.couch.delete(this.db, u._id, u._rev);
      throw e;
    }
  }

  getUser(id: string): Promise<UserDoc | null> {
    return this.couch.get<UserDoc>(this.db, `user_${id}`);
  }

  async getUserByUsername(username: string): Promise<UserDoc | null> {
    const u = await this.couch.get<UnameDoc>(this.db, `uname_${username}`);
    return u ? this.getUser(u.userId) : null;
  }

  usernameExists = async (username: string): Promise<boolean> => (await this.couch.get(this.db, `uname_${username}`)) !== null;

  updateUser(id: string, mutate: (u: UserDoc) => UserDoc): Promise<UserDoc> {
    return this.couch.update<UserDoc>(this.db, `user_${id}`, mutate);
  }

  async deleteUser(id: string): Promise<void> {
    const u = await this.getUser(id);
    if (!u?._rev) return;
    await this.couch.delete(this.db, u._id, u._rev);
    const n = await this.couch.get(this.db, `uname_${u.username}`);
    if (n?._rev) await this.couch.delete(this.db, n._id, n._rev);
    await this.revokeUserSessions(id);
  }

  /* ---------------------------------------------------------------- classes */

  createClass(c: Omit<ClassDoc, "_id" | "_rev" | "type">): Promise<ClassDoc> {
    return this.couch.put(this.db, { ...c, _id: `class_${c.id}`, type: "class" } as ClassDoc);
  }
  getClass(id: string): Promise<ClassDoc | null> {
    return this.couch.get<ClassDoc>(this.db, `class_${id}`);
  }
  listClasses(ownerId: string): Promise<ClassDoc[]> {
    return this.couch.find<ClassDoc>(this.db, { type: "class", ownerId });
  }
  updateClass(id: string, mutate: (c: ClassDoc) => ClassDoc): Promise<ClassDoc> {
    return this.couch.update<ClassDoc>(this.db, `class_${id}`, mutate);
  }

  /* ---------------------------------------------------------------- sessions (jetons de rafraîchissement) */

  createSession(s: Omit<SessionDoc, "_id" | "_rev" | "type">): Promise<SessionDoc> {
    return this.couch.put(this.db, { ...s, _id: `session_${s.id}`, type: "session" } as SessionDoc);
  }
  getSession(id: string): Promise<SessionDoc | null> {
    return this.couch.get<SessionDoc>(this.db, `session_${id}`);
  }
  /** Marque la session utilisée ; échoue (conflit) si une autre requête l'a déjà fait entre-temps. */
  markSessionUsed(s: SessionDoc, at: number): Promise<SessionDoc> {
    return this.couch.put(this.db, { ...s, usedAt: at });
  }
  async revokeFamily(familyId: string): Promise<void> {
    await this.revokeWhere({ type: "session", familyId });
  }
  async revokeUserSessions(userId: string): Promise<void> {
    await this.revokeWhere({ type: "session", userId });
  }
  private async revokeWhere(selector: Record<string, unknown>): Promise<void> {
    for (const s of await this.couch.find<SessionDoc>(this.db, selector)) {
      if (!s.revoked) await this.couch.update<SessionDoc>(this.db, s._id, (x) => ({ ...x, revoked: true })).catch(() => undefined);
    }
  }

  /* ---------------------------------------------------------------- registre des activités et instances */

  createActivity(a: Omit<ActivityReg, "_id" | "_rev" | "type">): Promise<ActivityReg> {
    return this.couch.put(this.db, { ...a, _id: `activity_${a.id}`, type: "activity" } as ActivityReg);
  }
  listActivities(ownerId: string): Promise<ActivityReg[]> {
    return this.couch.find<ActivityReg>(this.db, { type: "activity", ownerId });
  }
  listInstances(activityId: string): Promise<InstanceReg[]> {
    return this.couch.find<InstanceReg>(this.db, { type: "instance", activityId });
  }
  /** Tout le registre (activités, instances, enseignants) : sert à approvisionner les bases d'un serveur qui découvre des activités par réplication. */
  async registry(): Promise<{ activities: ActivityReg[]; instances: InstanceReg[]; teacherIds: string[] }> {
    const [activities, instances, users] = await Promise.all([
      this.couch.find<ActivityReg>(this.db, { type: "activity" }, 100_000),
      this.couch.find<InstanceReg>(this.db, { type: "instance" }, 100_000),
      this.couch.find<UserDoc>(this.db, { type: "user", role: "teacher" }, 100_000),
    ]);
    return { activities, instances, teacherIds: users.map((u) => u.id) };
  }
  getActivity(id: string): Promise<ActivityReg | null> {
    return this.couch.get<ActivityReg>(this.db, `activity_${id}`);
  }
  updateActivity(id: string, mutate: (a: ActivityReg) => ActivityReg): Promise<ActivityReg> {
    return this.couch.update<ActivityReg>(this.db, `activity_${id}`, mutate);
  }
  createInstance(i: Omit<InstanceReg, "_id" | "_rev" | "type">): Promise<InstanceReg> {
    return this.couch.put(this.db, { ...i, _id: `instance_${i.id}`, type: "instance" } as InstanceReg);
  }
  getInstance(id: string): Promise<InstanceReg | null> {
    return this.couch.get<InstanceReg>(this.db, `instance_${id}`);
  }
  updateInstance(id: string, mutate: (i: InstanceReg) => InstanceReg): Promise<InstanceReg> {
    return this.couch.update<InstanceReg>(this.db, `instance_${id}`, mutate);
  }

  /** Documents écrits par une personne (champ `authorId`) dans les bases de ses séances : export RGPD (accès, portabilité). */
  async authoredDocs(userId: string, instanceIds: string[]): Promise<{ instanceId: string; docs: Record<string, unknown>[] }[]> {
    const out: { instanceId: string; docs: Record<string, unknown>[] }[] = [];
    for (const instanceId of instanceIds) {
      const docs = await this.couch.find<Doc & Record<string, unknown>>(instanceDbName(instanceId), { authorId: userId }, 100_000).catch(() => []);
      out.push({ instanceId, docs: docs.map(({ _id, _rev, ...rest }) => rest) });
    }
    return out;
  }

  /** Efface ce qu'une personne a écrit dans les bases de ses séances (droit à l'effacement). Renvoie le nombre de documents supprimés. */
  async purgeAuthoredDocs(userId: string, instanceIds: string[]): Promise<number> {
    let n = 0;
    for (const instanceId of instanceIds) {
      const db = instanceDbName(instanceId);
      const docs = await this.couch.find<Doc>(db, { authorId: userId }, 100_000).catch(() => []);
      if (docs.length === 0) continue;
      const r = await this.couch.request("POST", `${encodeURIComponent(db)}/_bulk_docs`, { docs: docs.map((d) => ({ _id: d._id, _rev: d._rev, _deleted: true })) });
      if (r.status !== 201) throw new Error(`effacement ${db} : ${r.status}`);
      n += docs.length;
    }
    return n;
  }
}
