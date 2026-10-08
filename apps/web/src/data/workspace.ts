import { createRxDatabase, type RxCollection, type RxDatabase, type RxStorage } from "rxdb";
import { replicateCouchDB } from "rxdb/plugins/replication-couchdb";
import { BehaviorSubject, Observable, combineLatest, map, of, switchMap } from "rxjs";
import {
  assembleContent,
  collectionNameFor,
  decodeInstanceDocs,
  decodeMasterDocs,
  decodeTeacherDocs,
  findInstanceDoc,
  instanceDbName,
  emptyOverrides,
  estimateClockOffset,
  envelopeSchema,
  masterDbName,
  newId,
  orderBetween,
  type ActivityDoc,
  type AppDoc,
  type InstanceDoc,
  type InstanceScopedDoc,
  type ParticipantStateDoc,
  type MasterContent,
  type MasterDoc,
  type ResourceDoc,
  type StepDoc,
  type TeacherNoteDoc,
  teacherDbName,
} from "@toccata/schema";
import type { InstanceStore, NewRuntimeDoc, RuntimeDoc, RuntimeKind, Viewer } from "@toccata/apps-sdk";
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
export type ActivityRow = { id: string; title: string | null; description: string; stepCount: number; hiddenCount: number; resourceCount: number; appCount: number; updatedAt: number };

export type WorkspaceOptions = { userId: string; storage: RxStorage<unknown, unknown>; multiInstance?: boolean; now?: () => number; blobs?: BlobStore; role?: "teacher" | "student" };

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
    const ws = new Workspace(db, cols[REGISTRY] as unknown as Col, cols[UPLOADS] as unknown as Col, o.now ?? Date.now, o.blobs ?? memoryBlobStore(), o.userId);
    if (o.role === "teacher") await ws.named(collectionNameFor(teacherDbName(o.userId)));
    return ws;
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
    return this.named(collectionNameFor(masterDbName(activityId)));
  }

  /** Collection répliquée d'une base CouchDB (contenu d'une activité, ou base privée de l'enseignant). */
  private named(name: string): Promise<Col> {
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
    await Promise.all(
      refs.map(async (r) => {
        if (r.get("kind") === "iref") await Promise.all([this.master(r.get("activityId") as string), this.instance(r.get("id") as string)]);
        else await this.master(r.get("id") as string);
      }),
    );
  }

  /* ---------------------------------------------------------------- instances */

  private instance(instanceId: string): Promise<Col> {
    return this.named(collectionNameFor(instanceDbName(instanceId)));
  }

  /** Mémorise une instance (et ouvre son activité) : l'enseignant pour ses groupes, l'élève pour ses séances. */
  async rememberInstance(activityId: string, instanceId: string): Promise<void> {
    await this.registry.upsert({ id: instanceId, kind: "iref", activityId, updatedAt: this.now() });
    await Promise.all([this.master(activityId), this.instance(instanceId)]);
  }

  /** Élève : aligne les séances locales sur les inscriptions du serveur (ajouts et retraits). */
  async syncMemberships(refs: readonly { activityId: string; instanceId: string }[]): Promise<void> {
    const want = new Set(refs.map((r) => r.instanceId));
    for (const r of refs) await this.rememberInstance(r.activityId, r.instanceId);
    for (const row of await this.registry.find({ selector: { kind: "iref" } }).exec()) if (!want.has(row.get("id") as string)) await row.remove();
  }

  private irefs$(): Observable<{ instanceId: string; activityId: string }[]> {
    return this.registry.find({ selector: { kind: "iref" } }).$.pipe(map((rows) => rows.map((r) => ({ instanceId: r.get("id") as string, activityId: r.get("activityId") as string }))));
  }

  /** Tous les documents (décodés) d'une instance : données d'exécution, états, remises, consignes de pilotage. */
  instanceDocs$(instanceId: string): Observable<InstanceScopedDoc[]> {
    return new Observable<Col>((s) => {
      void this.instance(instanceId).then((c) => (s.next(c), s.complete()), (e) => s.error(e));
    }).pipe(
      switchMap((c) => c.find().$),
      map((rows) => decodeInstanceDocs(rows.map((r) => r.toJSON())).docs),
    );
  }

  /**
   * Définition d'une instance : le document écrit par l'enseignant propriétaire. Les autres documents `instance`
   * sont ignorés (défense en plus de la règle CouchDB) : un élève ne peut pas réécrire sa propre séance.
   */
  instance$(instanceId: string, ownerId: string): Observable<InstanceDoc | null> {
    return this.instanceDocs$(instanceId).pipe(map((docs) => findInstanceDoc(docs.filter((d) => d.authorId === ownerId))));
  }

  /** Instances d'une activité (vue de l'enseignant), avec leur définition quand elle est arrivée. */
  activityInstances$(activityId: string, ownerId: string): Observable<{ id: string; def: InstanceDoc | null }[]> {
    return this.irefs$().pipe(
      switchMap((refs) => {
        const mine = refs.filter((r) => r.activityId === activityId);
        return mine.length === 0 ? of([]) : combineLatest(mine.map((r) => this.instance$(r.instanceId, ownerId).pipe(map((def) => ({ id: r.instanceId, def })))));
      }),
      map((rows) => rows.sort((a, b) => (a.def?.name ?? "") .localeCompare(b.def?.name ?? "") || (a.id < b.id ? -1 : 1))),
    );
  }

  /** Séances d'un élève : une ligne par inscription, avec le titre de l'activité quand elle est arrivée. */
  runs$(): Observable<{ instanceId: string; activityId: string; title: string | null }[]> {
    return this.irefs$().pipe(
      switchMap((refs) => (refs.length === 0 ? of([]) : combineLatest(refs.map((r) => this.content$(r.activityId).pipe(map((c) => ({ ...r, title: c?.activity.title ?? null }))))))),
      map((rows) => rows.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "") || (a.instanceId < b.instanceId ? -1 : 1))),
    );
  }

  /** Écrit la définition d'une instance que le serveur vient d'approvisionner (le document porte l'identifiant de l'instance). */
  async createInstanceDef(instanceId: string, activityId: string, ownerId: string, name: string, memberIds: string[]): Promise<void> {
    await this.rememberInstance(activityId, instanceId);
    const t = this.now();
    const def: InstanceDoc = { id: instanceId, authorId: ownerId, kind: "instance", masterId: activityId, name, memberIds, linked: true, snapshot: null, overrides: emptyOverrides(), createdAt: t, updatedAt: t };
    await (await this.instance(instanceId)).upsert(def as unknown as Record<string, unknown>);
  }

  async updateInstanceDef(instanceId: string, change: (d: InstanceDoc) => InstanceDoc): Promise<void> {
    const row = await (await this.instance(instanceId)).findOne(instanceId).exec();
    if (!row) return;
    const next = change(row.toJSON() as unknown as InstanceDoc);
    await row.incrementalPatch({ ...(next as unknown as Record<string, unknown>), updatedAt: this.now() });
  }

  /** État du participant (étape en cours, élément ouvert) : un document par personne, au nom de la personne (roaming d'appareil). */
  participant$(instanceId: string, userId: string): Observable<ParticipantStateDoc | null> {
    return this.instanceDocs$(instanceId).pipe(map((docs) => docs.find((d): d is ParticipantStateDoc => d.kind === "participant" && d.id === userId) ?? null));
  }

  async saveParticipant(instanceId: string, userId: string, patch: Pick<ParticipantStateDoc, "currentStepId" | "openElement">, deviceId: string): Promise<void> {
    const col = await this.instance(instanceId);
    const t = this.now();
    const previous = await col.findOne(userId).exec();
    const doc: ParticipantStateDoc = { id: userId, authorId: userId, kind: "participant", userId, instanceId, appViewState: {}, deviceId, createdAt: (previous?.toJSON() as { createdAt?: number } | undefined)?.createdAt ?? t, updatedAt: t, ...patch };
    await col.upsert(doc as unknown as Record<string, unknown>);
  }

  /** Données d'exécution RÉELLES d'une instance (`inst_<id>`, répliquées) : même contrat que l'aperçu. */
  instanceStore(instanceId: string, viewer: Viewer): InstanceStore {
    return this.storeOver(this.instance(instanceId), viewer);
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
    return this.registry.find({ selector: { kind: "ref" } }).$.pipe(map((rows) => rows.map((r) => r.get("id") as string)));
  }

  /* ---------------------------------------------------------------- notes privées de l'enseignant */

  private notesCol(): Promise<Col> {
    return this.named(collectionNameFor(teacherDbName(this.userId)));
  }

  /** Notes de l'enseignant sur une activité (et ses étapes). Base privée : jamais lisible par les élèves. */
  notes$(activityId: string): Observable<TeacherNoteDoc[]> {
    return new Observable<Col>((s) => {
      void this.notesCol().then((c) => (s.next(c), s.complete()), (e) => s.error(e));
    }).pipe(
      switchMap((c) => c.find({ selector: { kind: "tnote" } }).$),
      map((rows) => decodeTeacherDocs(rows.map((r) => r.toJSON())).docs.filter((d) => d.activityId === activityId)),
    );
  }

  /** Une note par cible (activité ou étape) : on la crée au premier enregistrement puis on la met à jour. */
  async saveNote(activityId: string, stepId: string | null, patch: { body?: string; flag?: TeacherNoteDoc["flag"] }): Promise<void> {
    const col = await this.notesCol();
    const existing = decodeTeacherDocs((await col.find({ selector: { kind: "tnote" } }).exec()).map((r) => r.toJSON())).docs.find((d) => d.activityId === activityId && d.stepId === stepId);
    const t = this.now();
    const next: TeacherNoteDoc = {
      id: existing?.id ?? newId(t),
      kind: "tnote",
      authorId: this.userId,
      activityId,
      stepId,
      body: patch.body ?? existing?.body ?? "",
      flag: patch.flag === undefined ? (existing?.flag ?? null) : patch.flag,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
    };
    await col.upsert(next as unknown as Record<string, unknown>);
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

  async patchStep(activityId: string, stepId: string, patch: Partial<Pick<StepDoc, "title" | "instructions" | "hidden" | "locked" | "blockedByAppId">>): Promise<void> {
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

  /* ---------------------------------------------------------------- aperçu des applications */

  private previews = new Map<string, Promise<Col>>();
  private clockOffset = 0;

  /** Heure serveur estimée : l'heure de l'appareil corrigée du décalage mesuré à la synchronisation. */
  serverNow = (): number => Math.round(this.now() + this.clockOffset); // entier : les horodatages du schéma le sont

  /** Mesure le décalage d'horloge avec le serveur (en-tête `Date` de CouchDB, plusieurs échantillons, le plus court l'emporte). */
  async calibrateClock(): Promise<void> {
    const o = this.syncOptions;
    if (!o) return;
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const sentAtMs = Date.now();
      try {
        const r = await o.fetch(`${o.baseUrl}/`, { method: "HEAD" });
        const d = r.headers.get("date");
        if (d) samples.push({ sentAtMs, receivedAtMs: Date.now(), serverMs: Date.parse(d) });
      } catch {
        return;
      }
    }
    const off = estimateClockOffset(samples);
    if (off !== null && Number.isFinite(off)) this.clockOffset = off;
  }

  private preview(activityId: string): Promise<Col> {
    const name = collectionNameFor(`preview_${activityId}`);
    let c = this.previews.get(name);
    if (!c) {
      c = this.db.addCollections({ [name]: { schema: envelopeSchema as never } }).then((r) => r[name] as unknown as Col);
      this.previews.set(name, c);
    }
    return c;
  }

  /**
   * Données d'exécution de l'aperçu de l'enseignant : une instance LOCALE, jamais répliquée. L'éditeur et la séance
   * utilisent ainsi les mêmes composants (une instance réelle fournira un magasin identique, dans `inst_<id>`).
   */
  previewStore(activityId: string, viewer: Viewer): InstanceStore & { clear(appId: string): Promise<void> } {
    const col = this.preview(activityId);
    return {
      ...this.storeOver(col, viewer),
      clear: async (appId) => {
        const rows = await (await col).find().exec();
        await Promise.all(rows.filter((r) => (r.toJSON() as { appId?: string }).appId === appId).map((r) => r.remove()));
      },
    };
  }

  /** `InstanceStore` au-dessus d'une collection de documents d'instance (aperçu local ou `inst_<id>`). */
  private storeOver(col: Promise<Col>, viewer: Viewer): InstanceStore {
    const decode = (rows: { toJSON(): unknown }[]) => decodeInstanceDocs(rows.map((r) => r.toJSON())).docs;
    return {
      viewer,
      serverNow: this.serverNow,
      watch<K extends RuntimeKind>(kind: K, appId: string, cb: (docs: RuntimeDoc<K>[]) => void) {
        let stop = () => {};
        let gone = false;
        void col.then((c) => {
          if (gone) return;
          const sub = c.find({ selector: { kind } }).$.subscribe((rows) => cb(decode(rows).filter((d) => d.kind === kind && (d as { appId?: string }).appId === appId) as RuntimeDoc<K>[]));
          stop = () => sub.unsubscribe();
        });
        return () => {
          gone = true;
          stop();
        };
      },
      put: async <K extends RuntimeKind>(doc: NewRuntimeDoc<K>) => {
        const c = await col;
        const t = this.now();
        const id = doc.id ?? newId(t);
        const previous = (await c.findOne(id).exec())?.toJSON() as { createdAt?: number; authorId?: string } | undefined;
        // un document garde son auteur d'origine (la règle CouchDB l'exige) ; un nouveau est au nom de l'écrivant
        await c.upsert({ ...doc, id, authorId: previous?.authorId ?? viewer.id, createdAt: previous?.createdAt ?? t, updatedAt: t } as unknown as Record<string, unknown>);
        return id;
      },
      remove: async (id) => {
        await (await (await col).findOne(id).exec())?.remove();
      },
    };
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
    void this.calibrateClock();
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
    resourceCount: docs.filter((d) => d.kind === "resource").length,
    appCount: docs.filter((d) => d.kind === "app").length,
    updatedAt: Math.max(0, ...docs.map((d) => d.updatedAt)),
  };
}
