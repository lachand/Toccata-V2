import { expect, test, type Browser, type Page } from "@playwright/test";
import { createRequire } from "node:module";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
/** Violations axe-core d'une page réelle (le contraste est vérifié à part par `check-contrast`). */
async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run(document, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
}

// Phase 5 : suivi, micro-orchestration, remise et retours, miroir et télécommande, avec de vrais élèves dans des navigateurs séparés.
test.describe.configure({ mode: "serial" });
test.use({ locale: "fr-FR" });

const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const teacherName = `orch.${Date.now().toString(36)}`;
let students: { name: string; username: string; passphrase: string }[] = [];
let monitorUrl = "";

async function device(browser: Browser) {
  const context = await browser.newContext({ locale: "fr-FR" });
  return { context, page: await context.newPage() };
}
async function openRun(browser: Browser, who: { username: string; passphrase: string }) {
  const d = await device(browser);
  await d.page.goto("/login");
  await d.page.getByLabel("Identifiant").fill(who.username);
  await d.page.getByLabel("Mot de passe").fill(who.passphrase);
  await d.page.getByRole("button", { name: "Se connecter" }).click();
  await d.page.getByRole("article", { name: "Atelier piloté" }).getByRole("link", { name: "Ouvrir" }).click({ timeout: 45_000 });
  await expect(d.page.getByRole("heading", { level: 2, name: "Chercher" })).toBeVisible({ timeout: 45_000 });
  return d;
}

test("préparation : classe de deux élèves, activité avec un minuteur, un groupe par élève", async ({ browser }) => {
  const { context, page } = await device(browser);
  await page.goto("/signup");
  await page.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await page.getByLabel("Identifiant").fill(teacherName);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();

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
  await page.getByLabel("Titre", { exact: true }).fill("Atelier piloté");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter la première étape" }).click();
  const title = page.getByLabel("Titre de l’étape");
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Chercher");
  await title.blur();
  await page.getByRole("button", { name: "Ajouter une étape" }).click();
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Présenter");
  await title.blur();
  await page.getByRole("button", { name: "Chercher", exact: true }).click();
  const panel = page.getByRole("region", { name: "Ressources et applications de cette étape" });
  await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Minuteur/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(panel.locator('input[value="Minuteur"]')).toBeVisible();

  await page.getByRole("link", { name: "Distribuer" }).click();
  await page.getByRole("radio", { name: "Un par élève" }).check();
  await page.getByRole("button", { name: "Créer les groupes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Groupes de cette activité" }).getByLabel("Nom du groupe")).toHaveCount(2, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await context.close();
});

test("séance pilotée : aide, chrono prolongé, message, attention, retour, miroir", async ({ browser }) => {
  const [lina, hugo] = students as [typeof students[0], typeof students[0]];
  const L = await openRun(browser, lina);
  const H = await openRun(browser, hugo);

  // l'enseignant ouvre le suivi
  const T = await device(browser);
  await T.page.goto("/login");
  await T.page.getByLabel("Identifiant").fill(teacherName);
  await T.page.getByLabel("Mot de passe").fill(PASSWORD);
  await T.page.getByRole("button", { name: "Se connecter" }).click();
  await T.page.getByRole("article", { name: "Atelier piloté" }).getByRole("link", { name: "Modifier" }).click();
  await T.page.getByRole("link", { name: "Suivi" }).click();
  monitorUrl = T.page.url();
  const tileL = T.page.getByRole("article", { name: "Lina Aubert" });
  const tileH = T.page.getByRole("article", { name: "Hugo Martin" });
  await expect(tileL).toBeVisible({ timeout: 45_000 });
  await expect(tileL.getByText(/Étape 1 sur 2/)).toBeVisible({ timeout: 45_000 });
  expect(await axeViolations(T.page)).toEqual([]);
  expect(await axeViolations(L.page)).toEqual([]);

  // Lina demande de l'aide : sa tuile le signale (et passe en tête de liste)
  await L.page.getByRole("button", { name: "J’ai besoin d’aide" }).click();
  await expect(tileL.getByText(/demande de l’aide/)).toBeVisible({ timeout: 45_000 });
  await expect(T.page.getByRole("status").filter({ hasText: "demande de l’aide" })).toBeVisible();
  await expect(tileH.getByText(/demande de l’aide/)).toHaveCount(0);

  // Lina lance le chrono ; l'enseignant le voit tourner, puis ajoute 5 minutes à son groupe seulement
  await L.page.getByRole("radio", { name: "Minuteur" }).check();
  await L.page.getByRole("button", { name: "Démarrer" }).click();
  await expect(tileL.getByText("en cours")).toBeVisible({ timeout: 45_000 });
  await tileL.getByRole("checkbox", { name: "Choisir" }).check();
  await T.page.getByRole("region", { name: "Actions sur les groupes" }).getByRole("button", { name: "+5 min" }).click();
  await expect(L.page.getByRole("time")).toHaveText(/^(09:[3-5]\d|10:00)$/, { timeout: 45_000 });
  await tileL.getByRole("checkbox", { name: "Choisir" }).uncheck();

  // message à tous
  const bar = T.page.getByRole("region", { name: "Actions sur les groupes" });
  await bar.getByRole("button", { name: "Envoyer un message" }).click();
  await T.page.getByRole("dialog").getByLabel("Message").fill("Plus que cinq minutes !");
  await T.page.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }).click();
  for (const d of [L, H]) await expect(d.page.getByText("Plus que cinq minutes !")).toBeVisible({ timeout: 45_000 });

  // attention : les écrans sont figés (contenu inerte) jusqu'à la levée
  await bar.getByRole("button", { name: "Attirer l’attention", exact: true }).click();
  await T.page.getByRole("dialog").getByRole("button", { name: "Figer les écrans" }).click();
  for (const d of [L, H]) await expect(d.page.getByRole("alertdialog", { name: "Ton enseignant demande ton attention" })).toBeVisible({ timeout: 45_000 });
  await L.page.keyboard.press("Escape");
  await expect(L.page.getByRole("alertdialog")).toBeVisible(); // Échap ne la ferme pas
  expect(await axeViolations(L.page)).toEqual([]);
  expect(await L.page.locator("div[inert]").count()).toBeGreaterThan(0);
  await bar.getByRole("button", { name: "Lever l’attention" }).click();
  for (const d of [L, H]) await expect(d.page.getByRole("alertdialog")).toHaveCount(0, { timeout: 45_000 });

  // retour de l'enseignant : validé + commentaire, vus par Lina ; la demande d'aide est levée
  await tileL.getByRole("button", { name: "Retour", exact: true }).click();
  const dlg = T.page.getByRole("dialog");
  await dlg.getByLabel("Commentaire").fill("Regarde la deuxième source.");
  await dlg.getByRole("switch", { name: "Marquer l’étape comme validée" }).click();
  await dlg.getByRole("button", { name: "Envoyer le retour" }).click();
  await expect(L.page.getByText("Regarde la deuxième source.")).toBeVisible({ timeout: 45_000 });
  await expect(L.page.getByText("Validée")).toBeVisible();
  await expect(tileL.getByText(/demande de l’aide/)).toHaveCount(0, { timeout: 45_000 });

  // miroir : l'écran de Lina, en lecture seule
  await tileL.getByRole("link", { name: "Observer" }).click();
  await expect(T.page.getByRole("heading", { level: 2, name: "Chercher" })).toBeVisible({ timeout: 45_000 });
  const mirror = T.page.getByRole("group", { name: "Copie en lecture seule de l’écran de l’élève" });
  await expect(mirror).toHaveAttribute("inert", "");
  expect(await axeViolations(T.page)).toEqual([]);
  for (const d of [L, H, T]) await d.context.close();
});

test("télécommande : tient sur un téléphone sans débordement, et pilote la séance", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(teacherName);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  const activityId = /\/activities\/([^/]+)\/monitor/.exec(monitorUrl)![1]!;
  await page.goto(`/remote/${activityId}`);
  await expect(page.getByRole("article", { name: "Lina Aubert" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0); // pas de rail
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await axeViolations(page)).toEqual([]);
  const btn = page.getByRole("button", { name: "+1 min" });
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await context.close();
});
