import { instanceDbName, masterDbName, teacherDbName } from "@toccata/schema";
import type { CouchAdmin } from "./couch";
import { instanceValidator, masterValidator, teacherValidator } from "./vdu";

/** Crée et met à jour les bases CouchDB des activités et des instances (ADR 0003). */
export class Provisioner {
  constructor(private couch: CouchAdmin) {}

  private async setDesign(db: string, validate: string): Promise<void> {
    const cur = await this.couch.get(db, "_design/access");
    await this.couch.put(db, { _id: "_design/access", ...(cur?._rev ? { _rev: cur._rev } : {}), validate_doc_update: validate });
  }

  async provisionMaster(activityId: string, ownerIds: readonly string[]): Promise<string> {
    const db = masterDbName(activityId);
    await this.couch.ensureDb(db);
    await this.couch.putSecurity(db, {
      admins: { names: [], roles: [] },
      members: { names: [], roles: [...ownerIds.map((o) => `owner:${o}`), `master:${activityId}:read`] },
    });
    await this.setDesign(db, masterValidator(ownerIds));
    return db;
  }

  async provisionInstance(instanceId: string, ownerIds: readonly string[]): Promise<string> {
    const db = instanceDbName(instanceId);
    await this.couch.ensureDb(db);
    await this.couch.putSecurity(db, {
      admins: { names: [], roles: [] },
      members: { names: [], roles: [...ownerIds.map((o) => `owner:${o}`), `inst:${instanceId}:member`] },
    });
    await this.setDesign(db, instanceValidator(instanceId, ownerIds));
    return db;
  }

  /** Base privée d'un enseignant (idempotent). */
  async provisionTeacher(userId: string): Promise<string> {
    const db = teacherDbName(userId);
    await this.couch.ensureDb(db);
    await this.couch.putSecurity(db, { admins: { names: [], roles: [] }, members: { names: [], roles: [`owner:${userId}`] } });
    await this.setDesign(db, teacherValidator(userId));
    return db;
  }

  /** Rejoue la sécurité et les règles de toutes les bases d'une activité (ajout ou retrait d'un co-enseignant). */
  async syncOwners(activityId: string, instanceIds: readonly string[], ownerIds: readonly string[]): Promise<void> {
    await this.provisionMaster(activityId, ownerIds);
    for (const id of instanceIds) await this.provisionInstance(id, ownerIds);
  }
}
