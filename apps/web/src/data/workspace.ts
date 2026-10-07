import { createRxDatabase, type RxCollection, type RxDatabase, type RxStorage } from "rxdb";
import { replicateCouchDB } from "rxdb/plugins/replication-couchdb";
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from "rxjs";
import {
  assembleContent,
  collectionNameFor,
  decodeMasterDocs,
  envelopeSchema,
  masterDbName,
  newId,
  orderBetween,
  type ActivityDoc,
  type AppDoc,
  type MasterContent,
  type MasterDoc,
  type ResourceDoc,
  type StepDoc,
} from "@toccata/schema";
import { memoryBlobStore, type BlobStore } from "./blobs";
import { MAX_FILE_BYTES, downloadFile, sha256Hex, uploadFile } from "./files";

type Col = RxCollection<Record<string, unknown>>;
type Replication = { cancel: () => Promise<unknown>; error$: Observable<unknown> };

export type SyncOptions = {
  /** `fetch` authentifié (voir `syncFetch`). */
  fetch: typeof fetch;
  /** Adresse de CouchDB vue du navigateur, sans barre finale (ex. `/couch`). */
  baseUrl: string;
  /** `false` : n'envoyer que les fichiers en file, sans répliquer les documents (tests). */
  replicateData?: boolean;
};

export type SyncState = { running: boolean; failing: boolean };

/** Une ligne de la liste « Mes activités ». `title` est `null` tant que le document d'activité n'est pas arrivé. */
export type ActivityRow = { id: string; title: string | null; description: string; stepCount: number; hiddenCount: number; updatedAt: number };

export type WorkspaceOptions = { userId: string; storage: RxStorage<unknown, unknown>; multiInstance?: boolean; now?: () => number; blobs?: BlobStore };

/** Un document sans les champs que `Workspace` renseigne lui-même. */
type Fresh<T> = T extends unknown ? Omit<T, "id" | "kind" | "createdAt" | "updatedAt"> : never;
export type NewResource = Fresh<ResourceDoc>;
export type NewApp = Fresh<AppDoc>;

export class FileTooLargeError extends Error {
  constructor() {
    super("file_too_large");
  }
}

const REGISTRY = "registry";
const UPLOADS = "uploads";
const gates = new Map<string, Promise<unknown>>();

/**
 * Espace de travail local d'un utilisateur : une base RxDB (hors ligne d'abord) avec une collection par base CouchDB
 * `master_<id>` et un registre local des activités connues. Toutes les écritures passent ici ; rien dans l'interface
 * ne touche RxDB directement. La synchronisation est facultative (`startSync`) : sans réseau, tout continue de marcher.
 */
export class Workspace {
  readonly syncState$ = new BehaviorSubject<SyncState>({ running: false, failing: false });
  private cols = new Map<string, Promise<Col>>();
  private replications = new Map<string, Replication>();
  private syncOptions: SyncOptions | null = null;

  private constructor(private db: RxDatabase, private registry: Col, private uploads: Col, private now: () => number, private blobs: BlobStore, private userId: string) {}
  private urls = new Map<string, string>();

  static async open(o: WorkspaceOptions): Promise<Workspace> {
    const db = await createRxDatabase({ name: `toccata_${o.userId}`.toLowerCase(), storage: o.storage as RxStorage<never, never>, multiInstance: o.multiInstance ?? true });
    const cols = await db.addCollections({ [REGISTRY]: { schema: envelopeSchema as never }, [UPLOADS]: { schema: envelopeSchema as never } });
    return new Workspace(db, cols[REGISTRY] as unknown as Col, cols[UPLOADS] as unknown as Col, o.now ?? Date.now, o.blobs ?? memoryBlobStore(), o.userId);
  }

  /**
   * Ouvre l'espace de travail en s'assurant que la précédente ouverture du même nom est fermée (RxDB refuse deux
   * instances d'une même base : React rejoue les effets en développement, et on change de compte sans recharger).
   */
  static acquire(o: WorkspaceOptions): { ready: Promise<Workspace>; release: () => void } {
    const name = `toccata_${o.userId}`.toLowerCase();
    const ready = (gates.get(name) ?? Promise.resolve()).then(() => Workspace.open(o));
    return { ready, release: () => void gates.set(name, ready.then((w) => w.close(), () => undefined)) };
  }

  async close(): Promise<void> {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    await this.stopSync();
    await this.db.close();
  }

  /* ---------------------------------------------------------------- collections */

  private master(activityId: string): Promise<Col> {
    const name = collectionNameFor(masterDbName(activityId));
    let c = this.cols.get(name);
    if (!c) {
      c = this.db.addCollections({ [name]: { schema: envelopeSchema as never } }).then((r) => {
        const col = r[name] as unknown as Col;
        if (this.syncOptions) this.replicate(name, col);
        return col;
      });
      this.cols.set(name, c);
    }
    return c;
  }

  /** Mémorise une activité dans le registre (idempotent). */
  async remember(activityId: string): Promise<void> {
    await this.registry.upsert({ id: activityId, kind: "ref", updatedAt: this.now() });
    await this.master(activityId);
  }

  /** Ouvre toutes les activités du registre (au démarrage, avant la synchronisation). */
  async openKnown(): Promise<void> {
    const refs = await this.registry.find().exec();
    await Promise.all(refs.map((r) => this.master(r.get("id") as string)));
  }

  /* ---------------------------------------------------------------- lecture */

  private docs$(activityId: string): Observable<MasterDoc[]> {
    return new Observable<Col>((s) => {
      void this.master(activityId).then((c) => (s.next(c), s.complete()), (e) => s.error(e));
    }).pipe(
      switchMap((c) => c.find().$),
      map((rows) => decodeMasterDocs(rows.map((r) => r.toJSON())).docs),
    );
  }

  content$(activityId: string): Observable<MasterContent | null> {
    return this.docs$(activityId).pipe(map((docs) => assembleContent(docs)));
  }

  activities$(): Observable<ActivityRow[]> {
    return this.registryIds().pipe(
    switchMap((ids) =>
      ids.length === 0
        ? of([] as ActivityRow[])
        : combineLatest(ids.map((id) => this.docs$(id).pipe(map((docs) => summarize(id, docs))))).pipe(
            map((rows) => rows.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1))),
          ),
      ),
    );
  }

  private registryIds(): Observable<string[]> {
    return this.registry.find().$.pipe(map((rows) => rows.map((r) => r.get("id") as string)));
  }

  /* ---------------------------------------------------------------- écriture */

  /** Écrit le document d'activité d'une activité déjà approvisionnée par le serveur. */
  async createActivity(id: string, ownerId: string, title: string, locale: string): Promise<void> {
    await this.remember(id);
    const t = this.now();
    const doc: ActivityDoc = { id, kind: "activity", ownerId, title, description: "", locale, createdAt: t, updatedAt: t };
    await (await this.master(id)).upsert(doc as unknown as Record<string, unknown>);
  }

  async patchActivity(activityId: string, patch: Partial<Pick<ActivityDoc, "title" | "description">>): Promise<void> {
    await this.patch(activityId, activityId, patch);
  }

  async addStep(activityId: string, title: string, afterStepId?: string): Promise<string> {
    const steps = await this.sortedSteps(activityId);
    const at = afterStepId ? steps.findIndex((s) => s.id === afterStepId) : steps.length - 1;
    const order = orderBetween(steps[at]?.order ?? null, steps[at + 1]?.order ?? null);
    const t = this.now();
    const id = newId(t);
    const step: StepDoc = { id, kind: "step", activityId, title, instructions: "", order, hidden: false, locked: false, blockedByAppId: null, createdAt: t, updatedAt: t };
    await (await this.master(activityId)).insert(step as unknown as Record<string, unknown>);
    return id;
  }

  async patchStep(activityId: string, stepId: string, patch: Partial<Pick<StepDoc, "title" | "instructions" | "hidden" | "locked">>): Promise<void> {
    await this.patch(activityId, stepId, patch);
  }

  /** Déplace une étape à la position `toIndex` (0 = première) de la liste telle qu'elle sera après le déplacement. */
  async moveStep(activityId: string, stepId: string, toIndex: number): Promise<void> {
    const others = (await this.sortedSteps(activityId)).filter((s) => s.id !== stepId);
    const i = Math.max(0, Math.min(toIndex, others.length));
    await this.patch(activityId, stepId, { order: orderBetween(others[i - 1]?.order ?? null, others[i]?.order ?? null) });
  }

  /** Supprime l'étape et ce qui ne vit que par elle (ressources et applications à sa portée). */
  async removeStep(activityId: string, stepId: string): Promise<void> {
    const col = await this.master(activityId);
    const rows = await col.find().exec();
    const doomed = rows.filter((r) => {
      const d = r.toJSON() as { id: string; scope?: { type?: string; stepId?: string } };
      return d.id === stepId || (d.scope?.type === "step" && d.scope.stepId === stepId);
    });
    await Promise.all(doomed.map((r) => r.remove()));
  }

  /* ---------------------------------------------------------------- ressources et applications */

  async addResource(activityId: string, input: NewResource): Promise<string> {
    const t = this.now();
    const id = newId(t);
    await (await this.master(activityId)).insert({ ...input, id, kind: "resource", createdAt: t, updatedAt: t } as unknown as Record<string, unknown>);
    return id;
  }

  async removeResource(activityId: string, resourceId: string): Promise<void> {
    await (await (await this.master(activityId)).findOne(resourceId).exec())?.remove();
  }

  async renameResource(activityId: string, resourceId: string, name: string): Promise<void> {
    await this.patch(activityId, resourceId, { name });
  }

  async addApp(activityId: string, input: NewApp): Promise<string> {
    const t = this.now();
    const id = newId(t);
    await (await this.master(activityId)).insert({ ...input, id, kind: "app", createdAt: t, updatedAt: t } as unknown as Record<string, unknown>);
    return id;
  }

  async removeApp(activityId: string, appId: string): Promise<void> {
    await (await (await this.master(activityId)).findOne(appId).exec())?.remove();
  }

  /** `config` remplace la configuration entière (c'est l'éditeur de l'application qui la produit, déjà complète). */
  async patchApp(activityId: string, appId: string, patch: { name?: string; config?: AppDoc["config"] }): Promise<void> {
    await this.patch(activityId, appId, patch);
  }

  /* ---------------------------------------------------------------- fichiers */

  /**
   * Ajoute un fichier à l'activité : le contenu est gardé localement tout de suite (hors ligne possible) et mis en
   * file d'envoi ; la ressource est écrite avec son empreinte. L'envoi se fait dès qu'on est synchronisé.
   */
  async attachFile(activityId: string, file: Blob, name: string, scope: ResourceDoc["scope"]): Promise<string> {
    if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError();
    const fileId = `file_${await sha256Hex(file)}`;
    await this.blobs.put(fileId, file);
    await this.uploads.upsert({ id: `${activityId}:${fileId}`, kind: "upload", updatedAt: this.now(), activityId, fileId });
    const resourceId = await this.addResource(activityId, { scope, name, source: { type: "file", fileId, mime: file.type || "application/octet-stream", size: file.size } } as NewResource);
    void this.flushUploads();
    return resourceId;
  }

  /** Envoie les fichiers en attente (appelé après un ajout et à chaque début de synchronisation). Les échecs sont réessayés plus tard. */
  flushUploads(): Promise<void> {
    // à vol unique : deux déclencheurs rapprochés (ajout, début de synchronisation) n'envoient pas deux fois le même fichier
    this.flushing = this.flushing.then(() => this.flushOnce());
    return this.flushing;
  }
  private flushing: Promise<void> = Promise.resolve();
  private async flushOnce(): Promise<void> {
    const o = this.syncOptions;
    if (!o) return;
    for (const row of await this.uploads.find().exec()) {
      const u = row.toJSON() as unknown as { activityId: string; fileId: string };
      const blob = await this.blobs.get(u.fileId);
      try {
        if (blob) await uploadFile(o.fetch, o.baseUrl, masterDbName(u.activityId), u.fileId, blob, this.userId, this.now());
        await row.remove();
      } catch {
        /* réseau ou droits : le fichier reste en file */
      }
    }
  }

  pendingUploads$(): Observable<number> {
    return this.uploads.find().$.pipe(map((r) => r.length));
  }

  /** Adresse locale (`blob:`) d'un fichier ; le télécharge d'abord si on ne l'a pas encore. `null` : indisponible (hors ligne et jamais ouvert). */
  async fileUrl(activityId: string, fileId: string): Promise<string | null> {
    const known = this.urls.get(fileId);
    if (known) return known;
    let blob = await this.blobs.get(fileId);
    if (!blob && this.syncOptions) {
      try {
        blob = await downloadFile(this.syncOptions.fetch, this.syncOptions.baseUrl, masterDbName(activityId), fileId);
        await this.blobs.put(fileId, blob);
      } catch {
        return null;
      }
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(fileId, url);
    return url;
  }

  private async patch(activityId: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const doc = await (await this.master(activityId)).findOne(id).exec();
    await doc?.incrementalPatch({ ...patch, updatedAt: this.now() });
  }

  private async sortedSteps(activityId: string): Promise<StepDoc[]> {
    const rows = await (await this.master(activityId)).find().exec();
    const { docs } = decodeMasterDocs(rows.map((r) => r.toJSON()));
    return docs.filter((d): d is StepDoc => d.kind === "step").sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1));
  }

  /* ---------------------------------------------------------------- synchronisation */

  private replicate(name: string, col: Col): void {
    const o = this.syncOptions;
    if (!o || o.replicateData === false || this.replications.has(name)) return;
    const r = replicateCouchDB({
      replicationIdentifier: `toccata-${name}`,
      collection: col as never,
      url: `${o.baseUrl}/${name}/`,
      fetch: o.fetch,
      live: true,
      retryTime: 5_000,
      pull: { heartbeat: 30_000 },
      push: {},
    }) as unknown as Replication;
    r.error$.subscribe(() => this.syncState$.next({ running: true, failing: true }));
    this.replications.set(name, r);
  }

  async startSync(o: SyncOptions): Promise<void> {
    this.syncOptions = o;
    this.syncState$.next({ running: true, failing: false });
    for (const [name, c] of this.cols) this.replicate(name, await c);
    void this.flushUploads();
  }

  async stopSync(): Promise<void> {
    this.syncOptions = null;
    const all = [...this.replications.values()];
    this.replications.clear();
    await Promise.all(all.map((r) => r.cancel()));
    this.syncState$.next({ running: false, failing: false });
  }
}

function summarize(id: string, docs: readonly MasterDoc[]): ActivityRow {
  const activity = docs.find((d): d is ActivityDoc => d.kind === "activity");
  const steps = docs.filter((d): d is StepDoc => d.kind === "step");
  return {
    id,
    title: activity?.title ?? null,
    description: activity?.description ?? "",
    stepCount: steps.length,
    hiddenCount: steps.filter((s) => s.hidden).length,
    updatedAt: Math.max(0, ...docs.map((d) => d.updatedAt)),
  };
}
