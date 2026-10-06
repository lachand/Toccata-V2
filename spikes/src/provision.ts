import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { adminFetch, putJson, resetDb } from "./couch.js";

const design = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../../infra/couchdb/design/${f}`, import.meta.url)), "utf8");

async function must(r: Response, what: string) {
  if (!r.ok) throw new Error(`${what}: ${r.status} ${await r.text()}`);
}

/** Crée `master_<id>` : lisible par les participants, écrit par l'enseignant. */
export async function provisionMaster(base: string, id: string) {
  const db = `master_${id}`;
  await resetDb(base, db);
  await must(
    await putJson(adminFetch, `${base}/${db}/_security`, {
      admins: { names: [], roles: [] },
      members: { names: [], roles: [`master:${id}:read`, `master:${id}:write`] },
    }),
    "security master",
  );
  await must(
    await putJson(adminFetch, `${base}/${db}/_design/access`, {
      validate_doc_update: design("master.validate.js"),
    }),
    "vdu master",
  );
  return db;
}

/** Crée `inst_<id>` : une base par instance (isolation de lecture entre groupes). */
export async function provisionInstance(base: string, id: string) {
  const db = `inst_${id}`;
  await resetDb(base, db);
  await must(
    await putJson(adminFetch, `${base}/${db}/_security`, {
      admins: { names: [], roles: [] },
      members: { names: [], roles: [`inst:${id}:member`, `inst:${id}:teacher`] },
    }),
    "security inst",
  );
  await must(
    await putJson(adminFetch, `${base}/${db}/_design/access`, {
      validate_doc_update: design("instance.validate.js"),
    }),
    "vdu inst",
  );
  return db;
}
