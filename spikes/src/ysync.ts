import type { RxCollection } from "rxdb";
import * as Y from "yjs";

export const yUpdateSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 120 },
    docId: { type: "string", maxLength: 100 },
    kind: { type: "string", enum: ["update", "snapshot"] },
    authorId: { type: "string" },
    update: { type: "string" }, // base64 de l'update Yjs
    createdAt: { type: "number" },
  },
  required: ["id", "docId", "kind", "authorId", "update", "createdAt"],
  indexes: ["docId"],
} as const;

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

/**
 * Texte collaboratif : chaque modification Yjs est stockée comme un document RxDB immuable
 * (append-only), donc répliquée par CouchDB sans conflit. Compactable par snapshot.
 */
export class YSync {
  readonly ydoc = new Y.Doc();
  private seq = 0;
  private applied = new Set<string>();
  private sub: { unsubscribe(): void };

  constructor(
    private col: RxCollection<any>,
    private docId: string,
    private authorId: string,
  ) {
    this.ydoc.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === this) return; // venait de la base
      const id = `${docId}:${authorId}:${Date.now()}:${this.seq++}`;
      this.applied.add(id);
      void col.insert({ id, docId, kind: "update", authorId, update: b64(u), createdAt: Date.now() });
    });
    const q = col.find({ selector: { docId } });
    this.sub = q.$.subscribe((docs: any[]) => {
      for (const d of docs) {
        if (this.applied.has(d.id)) continue;
        this.applied.add(d.id);
        Y.applyUpdate(this.ydoc, unb64(d.update), this);
      }
    });
  }

  get text() {
    return this.ydoc.getText("body");
  }

  /** Remplace tous les updates connus par un seul snapshot (à lancer côté enseignant, rarement). */
  async compact() {
    const docs = await this.col.find({ selector: { docId: this.docId } }).exec();
    const merged = Y.mergeUpdates(docs.map((d: any) => unb64(d.update)));
    const id = `${this.docId}:snap:${Date.now()}`;
    this.applied.add(id);
    await this.col.insert({ id, docId: this.docId, kind: "snapshot", authorId: this.authorId, update: b64(merged), createdAt: Date.now() });
    await Promise.all(docs.map((d: any) => d.remove()));
  }

  destroy() {
    this.sub.unsubscribe();
    this.ydoc.destroy();
  }
}
