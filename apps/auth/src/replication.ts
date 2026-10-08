import { teacherDbName, instanceDbName, masterDbName } from "@toccata/schema";
import type { AccountStore } from "./accounts";
import type { Config } from "./config";
import type { CouchAdmin } from "./couch";
import type { Provisioner } from "./provisioning";

export type ServerInfo = Readonly<{
  mode: "cloud" | "local";
  name: string;
  /** `none` : serveur de référence. `online` : la copie suit l'amont. `offline` : amont injoignable ou réplication en panne. `unknown` : pas encore mesuré. */
  upstream: "none" | "online" | "offline" | "unknown";
  /** Dernière fois où l'amont était joignable ET toutes les réplications actives (epoch ms), `null` si jamais. */
  lastSyncAt: number | null;
  /** Nombre de réplications en panne. */
  failing: number;
}>;

type ReplicatorState = { state?: string };

/** Types de documents de comptes copiés vers un serveur de classe. Jamais les sessions (jetons de rafraîchissement). */
export const REPLICATED_ACCOUNT_TYPES = ["user", "class", "activity", "instance", "uname"] as const;

/**
 * Sélecteur des documents de comptes qu'un serveur de classe reçoit et renvoie : ceux des enseignants servis, de leurs
 * élèves et de leurs activités. Les comptes des autres enseignants ne quittent jamais le cloud.
 */
export function accountSelector(teacherIds: readonly string[]): Record<string, unknown> {
  return {
    type: { $in: [...REPLICATED_ACCOUNT_TYPES] },
    $or: [{ ownerId: { $in: [...teacherIds] } }, { createdBy: { $in: [...teacherIds] } }, { id: { $in: [...teacherIds] } }],
  };
}

/** Bases de données d'une activité, de ses instances et des enseignants, d'après le registre. */
export function contentDbs(reg: { activities: { id: string; ownerId: string }[]; instances: { id: string }[]; teacherIds: readonly string[] }): string[] {
  return [...reg.activities.map((a) => masterDbName(a.id)), ...reg.instances.map((i) => instanceDbName(i.id)), ...reg.teacherIds.map((t) => teacherDbName(t))];
}

/** Résume l'état de réplications `_scheduler` en un état d'amont. Pure, testée. */
export function summarizeUpstream(reachable: boolean, states: readonly ReplicatorState[]): { upstream: "online" | "offline"; failing: number } {
  const failing = states.filter((s) => s.state === "crashing" || s.state === "failed").length;
  return { upstream: reachable && failing === 0 ? "online" : "offline", failing };
}

/**
 * Rapprochement entre le registre des comptes et ce que le serveur contient réellement. Deux rôles :
 *  1. approvisionner (bases, droits, règles d'écriture) les activités et instances connues du registre — nécessaire des
 *     DEUX côtés, car `_security` ne se réplique pas et un serveur découvre les activités par réplication des comptes ;
 *  2. en mode local, maintenir les réplications continues avec l'amont, et mesurer leur santé.
 * Tout est idempotent : on peut le rejouer à volonté, et il reprend seul après une coupure.
 */
export class Reconciler {
  private provisioned = new Set<string>();
  private replicated = new Set<string>();
  private info: ServerInfo;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private cfg: Pick<Config, "SERVER_MODE" | "SERVER_NAME" | "ACCOUNTS_DB" | "TEACHER_IDS" | "UPSTREAM_COUCHDB_URL" | "UPSTREAM_PROBE_URL" | "UPSTREAM_ADMIN_USER" | "UPSTREAM_ADMIN_PASSWORD" | "LOCAL_COUCHDB_SELF_URL" | "COUCHDB_ADMIN_USER" | "COUCHDB_ADMIN_PASSWORD">,
    private accounts: AccountStore,
    private couch: CouchAdmin,
    private provisioner: Provisioner,
    private now: () => number = Date.now,
    private probe: (url: string) => Promise<boolean> = defaultProbe,
  ) {
    this.info = { mode: cfg.SERVER_MODE, name: cfg.SERVER_NAME, upstream: cfg.SERVER_MODE === "local" ? "unknown" : "none", lastSyncAt: null, failing: 0 };
  }

  getInfo(): ServerInfo {
    return this.info;
  }

  async provisionPass(): Promise<void> {
    // la bibliothèque de modèles n'existe que sur le serveur de référence (un serveur de classe n'en a pas l'usage)
    if (this.cfg.SERVER_MODE === "cloud" && !this.provisioned.has("library")) (await this.provisioner.provisionLibrary(), this.provisioned.add("library"));
    const reg = await this.accounts.registry();
    const owners = new Map(reg.activities.map((a) => [a.id, [a.ownerId, ...a.coOwnerIds]]));
    for (const a of reg.activities) {
      const key = `m:${a.id}`;
      if (!this.provisioned.has(key)) (await this.provisioner.provisionMaster(a.id, owners.get(a.id)!), this.provisioned.add(key));
    }
    for (const i of reg.instances) {
      const key = `i:${i.id}`;
      const o = owners.get(i.activityId);
      if (o && !this.provisioned.has(key)) (await this.provisioner.provisionInstance(i.id, o), this.provisioned.add(key));
    }
    for (const t of reg.teacherIds) {
      const key = `t:${t}`;
      if (!this.provisioned.has(key)) (await this.provisioner.provisionTeacher(t), this.provisioned.add(key));
    }
  }

  private repDoc(id: string, source: string, target: string, up: boolean, extra: Record<string, unknown> = {}) {
    const u = this.cfg.UPSTREAM_COUCHDB_URL!.replace(/\/$/, "");
    const auth = (user: string, pass: string) => ({ basic: { username: user, password: pass } });
    const local = (db: string) => ({ url: `${this.cfg.LOCAL_COUCHDB_SELF_URL.replace(/\/$/, "")}/${db}`, auth: auth(this.cfg.COUCHDB_ADMIN_USER, this.cfg.COUCHDB_ADMIN_PASSWORD) });
    const remote = (db: string) => ({ url: `${u}/${db}`, auth: auth(this.cfg.UPSTREAM_ADMIN_USER!, this.cfg.UPSTREAM_ADMIN_PASSWORD!) });
    return { _id: id, source: up ? local(source) : remote(source), target: up ? remote(target) : local(target), continuous: true, create_target: true, ...extra };
  }

  /** Crée (une fois) les deux réplications continues d'une base. Reprend seul après une coupure : c'est le rôle du réplicateur CouchDB. */
  private async ensureReplication(db: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (this.replicated.has(db)) return;
    for (const [suffix, up] of [["up", true], ["down", false]] as const) {
      const id = `toccata-${db}-${suffix}`;
      const exists = await this.couch.get("_replicator", id);
      if (!exists) await this.couch.put("_replicator", this.repDoc(id, db, db, up, extra));
    }
    this.replicated.add(db);
  }

  async replicationPass(): Promise<void> {
    if (this.cfg.SERVER_MODE !== "local") return;
    await this.couch.ensureDb("_replicator");
    await this.ensureReplication(this.cfg.ACCOUNTS_DB, { selector: accountSelector(this.cfg.TEACHER_IDS) });
    for (const db of contentDbs(await this.accounts.registry())) await this.ensureReplication(db);
  }

  /** Mesure l'état de l'amont : joignable ? réplications en panne ? */
  async measure(): Promise<void> {
    if (this.cfg.SERVER_MODE !== "local") return;
    const reachable = await this.probe(this.cfg.UPSTREAM_PROBE_URL ?? this.cfg.UPSTREAM_COUCHDB_URL!);
    const r = await this.couch.request("GET", "_scheduler/docs/_replicator?limit=1000");
    const docs: (ReplicatorState & { doc_id?: string })[] = r.status === 200 ? ((r.body?.docs as (ReplicatorState & { doc_id?: string })[]) ?? []).filter((d) => d.doc_id?.startsWith("toccata-")) : [];
    const s = summarizeUpstream(reachable, docs);
    this.info = { ...this.info, upstream: s.upstream, failing: s.failing, lastSyncAt: s.upstream === "online" ? this.now() : this.info.lastSyncAt };
  }

  /** Une passe complète. Ne lève jamais : un serveur de classe doit continuer à servir même si le rapprochement échoue. */
  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.provisionPass();
      await this.replicationPass();
      await this.measure();
    } catch (e) {
      console.warn("rapprochement :", e instanceof Error ? e.message : "erreur inconnue");
      if (this.cfg.SERVER_MODE === "local") this.info = { ...this.info, upstream: "offline" };
    } finally {
      this.busy = false;
    }
  }

  start(everyMs: number): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), everyMs);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

async function defaultProbe(url: string): Promise<boolean> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 3000);
  try {
    // `/_up` sans identifiants : le test ne porte que sur l'atteignabilité du réseau
    return (await fetch(`${url.replace(/\/$/, "")}/_up`, { signal: c.signal })).status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
