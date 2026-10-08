import { templateDocSchema, type TemplateDoc } from "@toccata/schema";
import { ApiError, type Fetcher } from "../auth/api";

const BASE = "/couch/library";

async function call(f: Fetcher, method: string, path: string, body?: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await f(`${BASE}${path}`, { method, headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new ApiError("network", 0);
  }
  return res;
}

/**
 * Bibliothèque de modèles partagés entre enseignants (base CouchDB `library`, réservée aux enseignants). Lecture directe,
 * en ligne : un modèle s'utilise rarement, et ce n'est pas du contenu de séance qui devrait fonctionner hors ligne.
 * Tout document lu est revalidé : la base peut contenir n'importe quoi, un modèle invalide est simplement écarté.
 */
export const libraryApi = (f: Fetcher) => ({
  async list(): Promise<TemplateDoc[]> {
    const res = await call(f, "GET", "/_all_docs?include_docs=true&limit=500");
    if (!res.ok) throw new ApiError(res.status === 403 || res.status === 401 ? "forbidden" : "internal", res.status);
    const rows = ((await res.json()) as { rows: { doc?: Record<string, unknown> }[] }).rows;
    return rows.flatMap((r) => {
      if (!r.doc || String(r.doc["_id"]).startsWith("_design/")) return [];
      const parsed = templateDocSchema.safeParse(r.doc);
      return parsed.success ? [parsed.data] : [];
    });
  },
  async publish(t: TemplateDoc): Promise<void> {
    const res = await call(f, "PUT", `/${encodeURIComponent(t.id)}`, t);
    if (!res.ok) throw new ApiError(res.status === 403 ? "forbidden" : res.status === 409 ? "conflict" : "internal", res.status);
  },
  async remove(id: string): Promise<void> {
    const head = await call(f, "GET", `/${encodeURIComponent(id)}`);
    if (head.status === 404) return;
    const rev = ((await head.json()) as { _rev: string })._rev;
    const res = await call(f, "DELETE", `/${encodeURIComponent(id)}?rev=${encodeURIComponent(rev)}`);
    if (!res.ok && res.status !== 404) throw new ApiError(res.status === 403 ? "forbidden" : "internal", res.status);
  },
});
