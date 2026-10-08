import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Fumée de production : en-têtes de sécurité, inscription fermée sans code, parcours enseignant → classe → élève → séance.
test.use({ locale: "fr-FR" });
test.describe.configure({ mode: "serial" });

const code = process.env["SIGNUP_CODE"] ?? /^SIGNUP_CODE='?([^'\n]+)'?$/m.exec(readFileSync(new URL("../../deploy/.env", import.meta.url), "utf8"))?.[1] ?? "";
const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const teacher = `prod.${Date.now().toString(36)}`;
let student = { username: "", passphrase: "" };

test("en-têtes de sécurité, CouchDB protégé, santé", async ({ request }) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const h = home.headers();
  expect(h["strict-transport-security"]).toBeTruthy();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["server"]).toBeUndefined();
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/couch/_all_dbs")).status()).toBe(401);
  expect((await request.get("/couch/_utils/")).status()).not.toBe(200); // pas d'interface d'administration publique
  expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
});

test("l'inscription enseignant est fermée sans le bon code", async ({ request }) => {
  const r = await request.post("/api/auth/teachers", { data: { username: `x${teacher}`, displayName: "X", password: PASSWORD, locale: "fr" }, headers: { "x-requested-with": "toccata" } });
  expect([400, 401, 403]).toContain(r.status());
  expect(JSON.stringify(await r.json())).not.toMatch(/[A-Z][a-zé]+ [a-zé]+ [a-zé]+/); // un code d'erreur, jamais une phrase
});

test("enseignant : compte (avec code), classe, activité, groupe ; élève : séance", async ({ browser }) => {
  test.skip(!code, "SIGNUP_CODE introuvable");
  const t = await (await browser.newContext({ locale: "fr-FR", ignoreHTTPSErrors: true })).newPage();
  await t.goto("/signup");
  await t.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await t.getByLabel("Identifiant").fill(teacher);
  await t.getByLabel("Mot de passe").fill(PASSWORD);
  await t.getByLabel("Code d'invitation").fill(code);
  await t.getByRole("button", { name: "Créer le compte" }).click();
  await expect(t.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible({ timeout: 30_000 });

  await t.getByRole("link", { name: "Classes" }).click();
  await t.getByRole("button", { name: "Nouvelle classe" }).first().click();
  await t.getByLabel("Nom de la classe").fill("Fumée");
  await t.getByRole("button", { name: "Créer la classe" }).click();
  await t.getByLabel("Noms des élèves").fill("Lina Aubert");
  await t.getByRole("button", { name: "Créer les comptes" }).click();
  const text = (await t.getByRole("region", { name: "Identifiants de connexion" }).locator(".cred-card").first().innerText()).replace(/\s+/g, " ");
  student = { username: /Identifiant\s+(\S+)/.exec(text)![1]!, passphrase: /Phrase de passe\s+(\S+)/.exec(text)![1]! };
  await t.getByRole("button", { name: "Terminé" }).click();

  await t.getByRole("link", { name: "Mes activités" }).click();
  await t.getByRole("button", { name: "Nouvelle activité" }).first().click();
  await t.getByLabel("Titre", { exact: true }).fill("Activité de fumée");
  await t.getByRole("button", { name: "Créer", exact: true }).click();
  await t.getByRole("button", { name: "Ajouter la première étape" }).click();
  const title = t.getByLabel("Titre de l’étape");
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Observer");
  await title.blur();
  await t.waitForTimeout(1000);
  await t.getByRole("link", { name: "Distribuer" }).click();
  await t.getByRole("radio", { name: "Un par élève" }).check();
  await t.getByRole("button", { name: "Créer les groupes", exact: true }).click();
  await expect(t.getByRole("region", { name: "Groupes de cette activité" }).getByLabel("Nom du groupe")).toHaveCount(1, { timeout: 30_000 });
  await t.waitForTimeout(1500);

  const s = await (await browser.newContext({ locale: "fr-FR", ignoreHTTPSErrors: true })).newPage();
  await s.goto("/login");
  await s.getByLabel("Identifiant").fill(student.username);
  await s.getByLabel("Mot de passe").fill(student.passphrase);
  await s.getByRole("button", { name: "Se connecter" }).click();
  await s.getByRole("article", { name: "Activité de fumée" }).getByRole("link", { name: "Ouvrir" }).click({ timeout: 60_000 });
  await expect(s.getByRole("heading", { level: 2, name: "Observer" })).toBeVisible({ timeout: 60_000 });
});
