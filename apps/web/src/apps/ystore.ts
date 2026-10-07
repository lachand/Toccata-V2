import type { InstanceStore } from "@toccata/apps-sdk";
import * as Y from "yjs";

const toB64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

/**
 * Texte collaboratif : chaque modification Yjs devient un document immuable (ajout seul) de l'instance, donc
 * répliqué par CouchDB sans conflit (spike c). Un document Yjs est commutatif et idempotent : recevoir deux fois
 * (ou dans le désordre) la même mise à jour ne change rien.
 */
export class YStore {
  readonly doc = new Y.Doc();
  private seen = new Set<string>();
  private stop: () => void;

  constructor(store: InstanceStore, appId: string) {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return; // venait de la base : ne pas la renvoyer
      void store.put({ kind: "yupdate", appId, form: "update", update: toB64(update) }).then((id) => this.seen.add(id));
    });
    this.stop = store.watch("yupdate", appId, (docs) => {
      for (const d of [...docs].sort((a, b) => a.createdAt - b.createdAt)) {
        if (this.seen.has(d.id)) continue;
        this.seen.add(d.id);
        Y.applyUpdate(this.doc, fromB64(d.update), this);
      }
    });
  }

  destroy(): void {
    this.stop();
    this.doc.destroy();
  }
}
