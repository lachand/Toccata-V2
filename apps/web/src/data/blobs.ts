/** Stockage local des fichiers (hors ligne) : le contenu reste ici tant qu'il n'est pas parti, puis sert de cache. */
export interface BlobStore {
  get(id: string): Promise<Blob | null>;
  put(id: string, blob: Blob): Promise<void>;
  delete(id: string): Promise<void>;
}

const CACHE = "toccata-files-v1";
const keyFor = (id: string) => `/_files/${encodeURIComponent(id)}`;

/** Cache API : durable, disponible hors ligne, séparée des données structurées. */
export const cacheBlobStore = (): BlobStore => ({
  async get(id) {
    const hit = await (await caches.open(CACHE)).match(keyFor(id));
    return hit ? hit.blob() : null;
  },
  async put(id, blob) {
    await (await caches.open(CACHE)).put(keyFor(id), new Response(blob, { headers: { "content-type": blob.type || "application/octet-stream" } }));
  },
  async delete(id) {
    await (await caches.open(CACHE)).delete(keyFor(id));
  },
});

export const memoryBlobStore = (): BlobStore => {
  const m = new Map<string, Blob>();
  return {
    get: async (id) => m.get(id) ?? null,
    put: async (id, b) => void m.set(id, b),
    delete: async (id) => void m.delete(id),
  };
};
