import { ApiError } from "./errors";

export class CouchConflict extends Error {
  constructor(readonly path: string) {
    super(`conflit sur ${path}`);
  }
}

type Json = Record<string, unknown>;
export type Doc = { _id: string; _rev?: string | undefined };

/** Client CouchDB avec les droits d'administrateur. Ne sort jamais de ce service. */
export class CouchAdmin {
  private auth: string;
  constructor(
    private base: string,
    user: string,
    password: string,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.base = base.replace(/\/$/, "");
    this.auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const res = await this.fetchImpl(`${this.base}/${path}`, {
      method,
      headers: { authorization: this.auth, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? null : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  async ensureDb(name: string): Promise<void> {
    const r = await this.request("PUT", encodeURIComponent(name));
    if (r.status !== 201 && r.status !== 412) throw new Error(`création de la base ${name} : ${r.status}`);
  }

  async dropDb(name: string): Promise<void> {
    await this.request("DELETE", encodeURIComponent(name));
  }

  async get<T extends Doc>(db: string, id: string): Promise<T | null> {
    const r = await this.request("GET", `${encodeURIComponent(db)}/${encodeURIComponent(id)}`);
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`lecture ${db}/${id} : ${r.status}`);
    return r.body as T;
  }

  /** Écrit un document ; lève `CouchConflict` si la révision n'est plus la bonne (ou si le document existe déjà). */
  async put<T extends Doc>(db: string, doc: T): Promise<T & { _rev: string }> {
    const path = `${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`;
    const r = await this.request("PUT", path, doc);
    if (r.status === 409) throw new CouchConflict(path);
    if (r.status !== 201 && r.status !== 202) throw new Error(`écriture ${db}/${doc._id} : ${r.status}`);
    return { ...doc, _rev: r.body.rev as string };
  }

  async delete(db: string, id: string, rev: string): Promise<void> {
    const r = await this.request("DELETE", `${encodeURIComponent(db)}/${encodeURIComponent(id)}?rev=${encodeURIComponent(rev)}`);
    if (r.status === 409) throw new CouchConflict(`${db}/${id}`);
    if (r.status !== 200 && r.status !== 404) throw new Error(`suppression ${db}/${id} : ${r.status}`);
  }

  async find<T extends Doc>(db: string, selector: Json, limit = 1000): Promise<T[]> {
    const r = await this.request("POST", `${encodeURIComponent(db)}/_find`, { selector, limit });
    if (r.status !== 200) throw new Error(`recherche ${db} : ${r.status}`);
    return r.body.docs as T[];
  }

  async createIndex(db: string, fields: string[]): Promise<void> {
    const r = await this.request("POST", `${encodeURIComponent(db)}/_index`, { index: { fields }, type: "json" });
    if (r.status !== 200) throw new Error(`index ${db} : ${r.status}`);
  }

  async putSecurity(db: string, security: { admins: { names: string[]; roles: string[] }; members: { names: string[]; roles: string[] } }): Promise<void> {
    const r = await this.request("PUT", `${encodeURIComponent(db)}/_security`, security);
    if (r.status !== 200) throw new Error(`sécurité ${db} : ${r.status}`);
  }

  /**
   * Met à jour un document avec relecture en cas de conflit (concurrence optimiste).
   * `mutate` reçoit la dernière version et renvoie la suivante.
   */
  async update<T extends Doc>(db: string, id: string, mutate: (current: T) => T, attempts = 6): Promise<T & { _rev: string }> {
    for (let i = 0; i < attempts; i++) {
      const cur = await this.get<T>(db, id);
      if (!cur) throw new ApiError("not_found");
      try {
        const next = { ...mutate(structuredClone(cur)), _id: id, _rev: cur._rev } as T;
        return await this.put(db, next);
      } catch (e) {
        if (!(e instanceof CouchConflict) || i === attempts - 1) throw e;
      }
    }
    throw new ApiError("conflict");
  }
}
