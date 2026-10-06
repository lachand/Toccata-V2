// Spike (b) — pièces jointes : que fait la réplication RxDB↔CouchDB, et quelle alternative retenir ?
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN_PASS, ADMIN_USER, CLOUD, LOCAL, adminFetch, bearerFetch, ensureSystemDbs, mintJwt, putJson, waitForCouch } from "../src/couch.js";
import { downloadFile, sha256, uploadFile } from "../src/files.js";
import { provisionInstance } from "../src/provision.js";
import { makeDb, noteSchema, replicate } from "../src/rx.js";

const noteWithAttachmentSchema = { ...noteSchema, attachments: {} } as const;

beforeAll(async () => {
  await waitForCouch(CLOUD);
  await waitForCouch(LOCAL);
  await ensureSystemDbs(CLOUD);
  await ensureSystemDbs(LOCAL);
  await provisionInstance(CLOUD, "f1");
  await provisionInstance(LOCAL, "f1");
});

describe("pièces jointes RxDB via replication-couchdb", () => {
  it("MESURE : un document portant une pièce jointe RxDB n'atteint jamais CouchDB", async () => {
    // Constat : le push RxDB envoie les « stubs » _attachments sans le contenu ; CouchDB rejette
    // le _bulk_docs et le plugin lève `responseJson.forEach is not a function`. Les pièces jointes
    // RxDB sont donc INUTILISABLES avec replication-couchdb (ADR 0004).
    const tokA = await mintJwt("alice", ["inst:f1:member"]);
    const db = await makeDb("att");
    const { notes } = await db.addCollections({ notes: { schema: noteWithAttachmentSchema } });
    const doc = await notes.insert({ id: "withfile", authorId: "alice", text: "avec fichier" });
    await doc.putAttachment({ id: "photo.png", data: new Blob([randomBytes(2048)]), type: "image/png" });
    const r = replicate(notes, `${CLOUD}/inst_f1/`, bearerFetch(tokA), "f1-att");
    r.error$.subscribe(() => {});
    await new Promise((res) => setTimeout(res, 4000));
    expect((await bearerFetch(tokA)(`${CLOUD}/inst_f1/withfile`)).status).toBe(404);
    await r.cancel();
  });
});

describe("alternative retenue : pièce jointe native CouchDB, fichier adressé par hash", () => {
  const data = new Uint8Array(randomBytes(5 * 1024 * 1024)); // 5 Mo
  it("un élève envoie un fichier dans SA base ; l'enseignant le relit", async () => {
    const alice = bearerFetch(await mintJwt("alice", ["inst:f1:member"]));
    const prof = bearerFetch(await mintJwt("prof", ["inst:f1:teacher"]));
    const id = await uploadFile(alice, `${CLOUD}/inst_f1`, data, "application/octet-stream", "alice");
    expect(id).toBe(`file_${sha256(data)}`);
    const back = await downloadFile(prof, `${CLOUD}/inst_f1`, id);
    expect(sha256(back)).toBe(sha256(data));
  });
  it("l'envoi est idempotent (même contenu, pas de doublon)", async () => {
    const alice = bearerFetch(await mintJwt("alice", ["inst:f1:member"]));
    const id1 = await uploadFile(alice, `${CLOUD}/inst_f1`, data, "application/octet-stream", "alice");
    const id2 = await uploadFile(alice, `${CLOUD}/inst_f1`, data, "application/octet-stream", "alice");
    expect(id1).toBe(id2);
  });
  it("un autre groupe ne peut pas télécharger le fichier", async () => {
    const bob = bearerFetch(await mintJwt("bob", ["inst:f2:member"]));
    const r = await bob(`${CLOUD}/inst_f1/file_${sha256(data)}/blob`);
    expect(r.status).toBe(403);
  });
  it("la réplication CouchDB↔CouchDB (cloud → serveur local) transporte la pièce jointe", async () => {
    const id = `file_${sha256(data)}`;
    // Les conteneurs partagent le réseau compose : le serveur local joint le cloud par son nom de service.
    const res = await adminFetch(`${LOCAL}/_replicate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: { url: "http://couch-cloud:5984/inst_f1", auth: { basic: { username: ADMIN_USER, password: ADMIN_PASS } } }, target: { url: "http://couch-local:5984/inst_f1", auth: { basic: { username: ADMIN_USER, password: ADMIN_PASS } } } }),
    });
    expect(res.ok, await res.clone().text()).toBe(true);
    const prof = bearerFetch(await mintJwt("prof", ["inst:f1:teacher"]));
    const back = await downloadFile(prof, `${LOCAL}/inst_f1`, id);
    expect(sha256(back)).toBe(sha256(data));
  });
});
