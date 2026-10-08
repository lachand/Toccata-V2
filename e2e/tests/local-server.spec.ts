import { expect, test, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { openSync } from "node:fs";
// @ts-expect-error — outil de développement en JavaScript, sans déclaration de types
import { startProxy } from "../../tools/switchable-proxy.mjs";

// Scénario CS1 de l'article (mobilité, résilience) avec la pile réelle :
//   cloud (CouchDB 5984, auth 8787, interface 4173)  ⇄  serveur de classe (CouchDB 5985, auth local 8788, interface 4174).
// Le serveur de classe est lancé PAR le test (il lui faut l'identifiant de l'enseignant) et joint le cloud à travers un proxy coupable.
test.describe.configure({ mode: "serial" });
test.use({ locale: "fr-FR" });

const CLOUD = "http://localhost:4173";
const CLASSROOM = "http://localhost:4174";
const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const teacherName = `cls.${Date.now().toString(36)}`;
const ADMIN = { user: process.env["COUCHDB_ADMIN_USER"] ?? process.env["COUCHDB_USER"] ?? "admin", pass: process.env["COUCHDB_ADMIN_PASSWORD"] ?? process.env["COUCHDB_PASSWORD"] ?? "spike-admin-pass" };

let proxy: { port: number; setOn(v: boolean): void; close(): Promise<void> };
let localAuth: ChildProcess | null = null;
let students: { name: string; username: string; passphrase: string }[] = [];
let teacherId = "";
let activityId = "";

const info = async () => (await (await fetch("http://127.0.0.1:8788/api/server-info")).json()) as { upstream: string };
async function until(cond: () => Promise<boolean>, what: string, ms = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await cond()) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`délai dépassé : ${what}`);
}
async function device(browser: Browser, extra: { offline?: boolean } = {}) {
  const context = await browser.newContext({ locale: "fr-FR" });
  void extra;
  return { context, page: await context.newPage() };
}

test.beforeAll(async () => {
  proxy = await startProxy({ target: process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984" });
});
test.afterAll(async () => {
  if (localAuth?.pid) {
    try {
      process.kill(-localAuth.pid, "SIGTERM");
    } catch {
      /* déjà arrêté */
    }
  }
  // arrête les réplications du serveur de classe (sinon elles tournent dans le vide) et vide ce CouchDB de test
  const base = "http://127.0.0.1:5985";
  const h = { authorization: "Basic " + Buffer.from(`${ADMIN.user}:${ADMIN.pass}`).toString("base64") };
  const reps = (await (await fetch(`${base}/_replicator/_all_docs`, { headers: h })).json().catch(() => ({ rows: [] }))) as { rows?: { id: string; value: { rev: string } }[] };
  for (const r of reps.rows ?? []) if (r.id.startsWith("toccata-")) await fetch(`${base}/_replicator/${r.id}?rev=${r.value.rev}`, { method: "DELETE", headers: h });
  await new Promise((r) => setTimeout(r, 1500));
  for (const db of ((await (await fetch(`${base}/_all_dbs`, { headers: h })).json()) as string[]).filter((d) => !d.startsWith("_"))) await fetch(`${base}/${db}`, { method: "DELETE", headers: h });
  await proxy.close();
});

test("préparation sur le cloud : classe, activité avec un kanban, un groupe par élève", async ({ browser }) => {
  const { context, page } = await device(browser);
  await page.goto(`${CLOUD}/signup`);
  await page.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await page.getByLabel("Identifiant").fill(teacherName);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  teacherId = await page.evaluate(async () => (await (await fetch("/api/auth/refresh", { method: "POST", headers: { "x-requested-with": "toccata" } })).json()).user.id as string);

  await page.getByRole("link", { name: "Classes" }).click();
  await page.getByRole("button", { name: "Nouvelle classe" }).first().click();
  await page.getByLabel("Nom de la classe").fill("4e B");
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await page.getByLabel("Noms des élèves").fill("Lina Aubert\nHugo Martin");
  await page.getByRole("button", { name: "Créer les comptes" }).click();
  const sheet = page.getByRole("region", { name: "Identifiants de connexion" });
  const cards = sheet.locator(".cred-card");
  await expect(cards).toHaveCount(2);
  students = [];
  for (let i = 0; i < 2; i++) {
    const text = (await cards.nth(i).innerText()).replace(/\s+/g, " ");
    students.push({ name: i === 0 ? "Lina Aubert" : "Hugo Martin", username: /Identifiant\s+(\S+)/.exec(text)![1]!, passphrase: /Phrase de passe\s+(\S+)/.exec(text)![1]! });
  }
  await sheet.getByRole("button", { name: "Terminé" }).click();

  await page.getByRole("link", { name: "Mes activités" }).click();
  await page.getByRole("button", { name: "Nouvelle activité" }).first().click();
  await page.getByLabel("Titre", { exact: true }).fill("Atelier en classe");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter la première étape" }).click();
  const title = page.getByLabel("Titre de l’étape");
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Organiser");
  await title.blur();
  const panel = page.getByRole("region", { name: "Ressources et applications de cette étape" });
  await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Tableau kanban/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(panel.locator('input[value="Tableau kanban"]')).toBeVisible();
  activityId = /\/activities\/([^/]+)/.exec(page.url())![1]!;
  await page.waitForTimeout(1000);

  await page.getByRole("link", { name: "Distribuer" }).click();
  await page.getByRole("radio", { name: "Un par élève" }).check();
  await page.getByRole("button", { name: "Créer les groupes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Groupes de cette activité" }).getByLabel("Nom du groupe")).toHaveCount(2, { timeout: 30_000 });
  await page.waitForTimeout(2000); // le cloud pousse les définitions vers CouchDB avant le rattachement du serveur de classe
  await context.close();
});

test("le serveur de classe démarre, rattrape le cloud et sert les élèves", async () => {
  test.setTimeout(400_000);
  localAuth = spawn("pnpm", ["--filter", "@toccata/auth", "start"], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: "8788",
      COUCHDB_URL: "http://127.0.0.1:5985",
      COUCHDB_ADMIN_USER: ADMIN.user,
      COUCHDB_ADMIN_PASSWORD: ADMIN.pass,
      ACCOUNTS_DB: process.env["E2E_ACCOUNTS_DB"]!,
      JWT_SECRET: Buffer.from("dev-only-secret-change-me-32-bytes!!").toString("base64"),
      JWT_KID: "dev",
      COOKIE_SECURE: "false",
      SERVER_MODE: "local",
      SERVER_NAME: "Classe test",
      UPSTREAM_COUCHDB_URL: `http://host.docker.internal:${proxy.port}`,
      UPSTREAM_PROBE_URL: `http://127.0.0.1:${proxy.port}`,
      UPSTREAM_ADMIN_USER: ADMIN.user,
      UPSTREAM_ADMIN_PASSWORD: ADMIN.pass,
      TEACHER_IDS: teacherId,
      RECONCILE_SECONDS: "3",
    },
    detached: true, // propre groupe de processus : pnpm lance tsx, et `kill` seul laisserait le service tourner
    stdio: ["ignore", openSync("test-results/local-auth.log", "w"), openSync("test-results/local-auth.log", "a")], // journal du serveur de classe, utile pour comprendre un échec
  });
  await until(async () => (await info()).upstream === "online", "serveur de classe en ligne vers le cloud");
  const s = students[0]!;
  await until(
    async () => (await fetch("http://127.0.0.1:8788/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: s.username, password: s.passphrase }) })).status === 200,
    "le compte de l'élève est arrivé sur le serveur de classe",
  );
});

test("l'élève joue sur le serveur de classe ; coupure d'Internet ; reprise ; le cloud retrouve tout", async ({ browser }) => {
  const lina = students[0]!;
  test.setTimeout(900_000);
  const L = await device(browser);
  await L.page.goto(`${CLASSROOM}/login`);
  await L.page.getByLabel("Identifiant").fill(lina.username);
  await L.page.getByLabel("Mot de passe").fill(lina.passphrase);
  await L.page.getByRole("button", { name: "Se connecter" }).click();
  await L.page.getByRole("article", { name: "Atelier en classe" }).getByRole("link", { name: "Ouvrir" }).click({ timeout: 90_000 });
  await expect(L.page.getByRole("heading", { level: 2, name: "Organiser" })).toBeVisible({ timeout: 90_000 });
  await expect(L.page.getByRole("status").filter({ hasText: "Classe test" })).toBeVisible({ timeout: 30_000 });
  await L.page.getByRole("radio", { name: "Tableau kanban" }).check();
  const todo = L.page.getByRole("region", { name: "À faire" });
  const add = async (text: string) => {
    await todo.getByRole("textbox", { name: /Nouvelle carte dans/ }).fill(text);
    await todo.getByRole("textbox", { name: /Nouvelle carte dans/ }).press("Enter");
    await expect(todo.locator(`input[value="${text}"]`)).toBeVisible();
  };
  await add("Carte en classe");

  // coupure d'Internet : le serveur de classe le sait, l'élève continue et le voit
  proxy.setOn(false);
  await until(async () => (await info()).upstream === "offline", "coupure détectée par le serveur de classe", 120_000);
  await expect(L.page.getByRole("status").filter({ hasText: "pas d’Internet" })).toBeVisible({ timeout: 60_000 });
  await add("Carte pendant la coupure");

  // l'enseignant, sur le cloud, ne voit pas encore la carte écrite pendant la coupure
  const T = await device(browser);
  await T.page.goto(`${CLOUD}/login`);
  await T.page.getByLabel("Identifiant").fill(teacherName);
  await T.page.getByLabel("Mot de passe").fill(PASSWORD);
  await T.page.getByRole("button", { name: "Se connecter" }).click();
  await expect(T.page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  await T.page.goto(`${CLOUD}/activities/${activityId}/monitor`);
  const tile = T.page.getByRole("article", { name: "Lina Aubert" });
  await expect(tile).toBeVisible({ timeout: 60_000 });

  // rétablissement : tout converge, sans perte
  proxy.setOn(true);
  await until(async () => (await info()).upstream === "online", "amont de nouveau en ligne", 120_000);
  await expect(tile.getByText(/À faire 2/)).toBeVisible({ timeout: 120_000 });

  // coupure du réseau de l'appareil de l'élève lui-même : il continue, puis tout rejoint le serveur au retour
  await L.context.setOffline(true);
  await expect(L.page.getByRole("status").filter({ hasText: "Hors ligne, vos modifications" })).toBeVisible({ timeout: 60_000 });
  await add("Carte hors ligne");
  await L.context.setOffline(false);
  await expect(tile.getByText(/À faire 3/)).toBeVisible({ timeout: 120_000 });
  for (const d of [L, T]) await d.context.close();
});
