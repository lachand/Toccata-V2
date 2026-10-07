/**
 * Enveloppe RxDB commune à toutes les collections : une collection RxDB par base CouchDB
 * (`master_<id>`, `inst_<id>`), contenant des documents de plusieurs genres (`kind`).
 *
 * RxDB ne valide que cette enveloppe (clé, genre, date de mise à jour) ; la validité complète
 * est vérifiée par Zod aux frontières (`decodeMasterDocs`, `decodeInstanceDocs`). Les champs
 * non déclarés sont conservés tels quels (vérifié par le test `rx.test.ts`).
 */
export const envelopeSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 128 },
    kind: { type: "string", maxLength: 20 },
    updatedAt: { type: "number", minimum: 0, maximum: 1e15, multipleOf: 1 },
  },
  required: ["id", "kind", "updatedAt"],
  indexes: [["kind", "updatedAt"]],
} as const;

/** Nom de collection RxDB pour une base CouchDB (`master_x` → `master_x`) : minuscules, `_` autorisé. */
export const collectionNameFor = (dbName: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(dbName)) throw new RangeError(`nom de base invalide : ${dbName}`);
  return dbName;
};
