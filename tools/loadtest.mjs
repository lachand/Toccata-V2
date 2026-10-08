#!/usr/bin/env node
// Test de charge (cas d'étude 2 de l'article : une classe de ~40 élèves en 4 groupes). Aucune dépendance.
//   node tools/loadtest.mjs --base https://toccata.example.org [--code CODE] [--students 40] [--groups 4] [--writes 20] [--interval 1000]
// Crée un enseignant, une classe, une activité et les groupes ; chaque élève se connecte, écoute le flux de changements de SON groupe et y écrit
// `writes` événements. Mesure : latence de connexion, latence d'écriture, délai de propagation (écriture → vue par un autre élève du groupe),
// et vérifie qu'AUCUN document n'est perdu. Code de sortie 1 si une perte, une erreur ou un dépassement de seuil est constaté.
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1:8787" },
    couch: { type: "string" }, // par défaut : <base>/couch si <base> se termine par un domaine, sinon http://127.0.0.1:5984
    code: { type: "string" },
    students: { type: "string", default: "40" },
    groups: { type: "string", default: "4" },
    writes: { type: "string", default: "20" },
    interval: { type: "string", default: "1000" },
    "max-p95-ms": { type: "string", default: "1500" },
    insecure: { type: "boolean", default: false },
  },
});
if (a.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const BASE = a.base.replace(/\/$/, "");
const API = `${BASE}/api`;
const COUCH = a.couch ?? (BASE.includes("127.0.0.1:8787") || BASE.includes("localhost:8787") ? "http://127.0.0.1:5984" : `${BASE}/couch`);
const N = Number(a.students), G = Number(a.groups), W = Number(a.writes), EVERY = Number(a.interval);
const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const pct = (xs, p) => (xs.length ? [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : NaN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { body, token } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const couch = (token) => async (method, path, body) => {
  const r = await fetch(`${COUCH}/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const newId = () => {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  let s = ""; for (let i = 0; i < 22; i++) s += alphabet[Math.floor(Math.random() * 32)];
  return s;
};

console.log(`Charge : ${N} élèves, ${G} groupes, ${W} écritures chacun toutes les ~${EVERY} ms → ${API}`);
const stamp = Date.now().toString(36);
const teacher = await api("POST", "/auth/teachers", { body: { username: `load.${stamp}`, displayName: "Charge", password: PASSWORD, locale: "fr", ...(a.code ? { inviteCode: a.code } : {}) } });
const T = teacher.accessToken;
const klass = await api("POST", "/classes", { token: T, body: { name: "Charge" } });
const names = Array.from({ length: N }, (_, i) => `Eleve Test${String(i).padStart(2, "0")}`);
const students = [];
for (let i = 0; i < N; i += 50) students.push(...(await api("POST", `/classes/${klass.id}/students`, { token: T, body: { names: names.slice(i, i + 50) } })).students);
const act = await api("POST", "/activities", { token: T });
const groups = [];
for (let g = 0; g < G; g++) {
  const members = students.filter((_, i) => i % G === g);
  const inst = await api("POST", `/activities/${act.id}/instances`, { token: T, body: { memberIds: members.map((s) => s.id) } });
  groups.push({ db: inst.dbName, id: inst.id, members });
}

// connexions simultanées : toute la classe s'identifie en même temps (derrière une même adresse IP, comme en salle)
const loginMs = [];
let loginErrors = 0;
const clients = await Promise.all(groups.flatMap((g) => g.members.map(async (s) => {
  const t0 = performance.now();
  try {
    const r = await api("POST", "/auth/login", { body: { username: s.username, password: s.passphrase } });
    loginMs.push(performance.now() - t0);
    return { s, g, token: r.accessToken };
  } catch (e) { loginErrors++; console.error(String(e).slice(0, 160)); return null; }
})));
const live = clients.filter(Boolean);

const writeMs = [], propMs = [];
let writeErrors = 0;
const written = new Map(groups.map((g) => [g.db, new Set()]));
let stop = false;

// écoute : un flux « longpoll » par groupe (un seul client suffit à mesurer la propagation du point de vue d'un autre élève)
const listeners = groups.map(async (g) => {
  const listener = live.find((c) => c.g === g);
  if (!listener) return;
  const db = couch(listener.token);
  let since = (await db("GET", `${g.db}`)).json?.update_seq ?? "now";
  while (!stop) {
    const r = await db("GET", `${g.db}/_changes?feed=longpoll&since=${encodeURIComponent(since)}&include_docs=true&timeout=3000`);
    if (r.status !== 200) { await sleep(500); continue; }
    since = r.json.last_seq;
    const now = Date.now();
    for (const row of r.json.results) if (row.doc?.kind === "event" && row.doc.authorId !== listener.s.id) propMs.push(now - row.doc.createdAt);
  }
});

const runStart = performance.now();
await Promise.all(live.map(async (c, k) => {
  await sleep((k * 37) % EVERY);
  const db = couch(c.token);
  for (let w = 0; w < W && !stop; w++) {
    const id = newId(), t = Date.now();
    const t0 = performance.now();
    const r = await db("PUT", `${c.g.db}/${id}`, { kind: "event", authorId: c.s.id, instanceId: c.g.id, action: "step.enter", object: newId(), initiatedBy: "user", createdAt: t, updatedAt: t });
    writeMs.push(performance.now() - t0);
    if (r.status === 201) written.get(c.g.db).add(id); else { writeErrors++; if (writeErrors < 5) console.error("écriture refusée", r.status, JSON.stringify(r.json)); }
    await sleep(EVERY * (0.7 + Math.random() * 0.6));
  }
}));
await sleep(1500); // laisse les derniers changements arriver
stop = true;
await Promise.race([Promise.all(listeners), sleep(4000)]);

// aucune perte : ce qui a été accepté est bien là, pour chaque groupe
let lost = 0;
for (const g of groups) {
  const r = await couch(T)("POST", `${g.db}/_find`, { selector: { kind: "event" }, fields: ["_id"], limit: 100000 });
  const have = new Set((r.json?.docs ?? []).map((d) => d._id));
  for (const id of written.get(g.db)) if (!have.has(id)) lost++;
}

const total = [...written.values()].reduce((n, s) => n + s.size, 0);
const row = (name, xs) => console.log(`${name.padEnd(28)} p50 ${pct(xs, 50).toFixed(0).padStart(5)} ms · p95 ${pct(xs, 95).toFixed(0).padStart(5)} ms · max ${Math.max(...xs).toFixed(0).padStart(5)} ms (n=${xs.length})`);
console.log(`\nDurée : ${((performance.now() - runStart) / 1000).toFixed(1)} s · élèves connectés : ${live.length}/${N}`);
row("connexion", loginMs); row("écriture", writeMs); row("propagation (vue par un pair)", propMs);
console.log(`écritures acceptées : ${total} · refusées : ${writeErrors} · connexions refusées : ${loginErrors} · documents perdus : ${lost}`);
const p95 = pct(propMs, 95);
const ok = lost === 0 && writeErrors === 0 && loginErrors === 0 && live.length === N && p95 <= Number(a["max-p95-ms"]);
console.log(ok ? "✔ charge supportée" : `✘ échec (seuil de propagation p95 : ${a["max-p95-ms"]} ms)`);
// nettoyage : les bases de la charge sont supprimées par le propriétaire d'activité via l'administration (voir docs/charge.md)
process.exit(ok ? 0 : 1);
