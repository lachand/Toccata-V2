import { expect, test, type Browser, type Page } from "@playwright/test";

// Phase 7 : réutilisation (D8). Un enseignant partage un modèle, un autre l'utilise ; export puis import d'un fichier .toccata.
test.describe.configure({ mode: "serial" });
test.use({ locale: "fr-FR" });

const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const stamp = Date.now().toString(36);
const [teacherA, teacherB] = [`reu.a.${stamp}`, `reu.b.${stamp}`];
const TITLE = `Atelier partagé ${stamp}`;

async function signUp(browser: Browser, username: string, display: string): Promise<Page> {
  const context = await browser.newContext({ locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Nom affiché aux élèves").fill(display);
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  return page;
}

let pageA: Page;

test("l'enseignante A écrit un script et le partage comme modèle", async ({ browser }) => {
  pageA = await signUp(browser, teacherA, "Marie Durand");
  await pageA.getByRole("button", { name: "Nouvelle activité" }).first().click();
  await pageA.getByLabel("Titre", { exact: true }).fill(TITLE);
  await pageA.getByRole("button", { name: "Créer", exact: true }).click();
  await pageA.getByRole("button", { name: "Ajouter la première étape" }).click();
  const title = pageA.getByLabel("Titre de l’étape");
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Observer");
  await title.blur();
  await pageA.waitForTimeout(1000);

  await pageA.getByRole("button", { name: "Partager comme modèle" }).click();
  const dialog = pageA.getByRole("dialog");
  await dialog.getByRole("button", { name: "Partager", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Terminé" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Terminé" }).click();
});

test("l'enseignant B trouve le modèle dans la bibliothèque et en fait sa propre activité", async ({ browser }) => {
  const b = await signUp(browser, teacherB, "Paul Roux");
  await b.getByRole("link", { name: "Modèles" }).click();
  const card = b.getByRole("article", { name: TITLE });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/Marie Durand/)).toBeVisible();
  await card.getByRole("button", { name: "Utiliser ce modèle" }).click();
  await expect(b.getByRole("heading", { level: 1, name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(b.getByRole("button", { name: "Observer", exact: true })).toBeVisible({ timeout: 30_000 });
  await b.context().close();
});

test("export puis import d'un fichier .toccata : une copie indépendante", async () => {
  await pageA.goto("/");
  const card = pageA.getByRole("article", { name: TITLE });
  await expect(card).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([pageA.waitForEvent("download"), card.getByRole("button", { name: "Exporter" }).click()]);
  const path = (await download.path())!;
  expect((await import("node:fs")).readFileSync(path).subarray(0, 2).toString()).toBe("PK"); // une archive ZIP

  await pageA.locator('input[type="file"]').setInputFiles(path);
  await expect(pageA.getByRole("heading", { level: 1 })).toContainText(TITLE, { timeout: 30_000 });
  await expect(pageA.getByRole("button", { name: "Observer", exact: true })).toBeVisible({ timeout: 30_000 });
  await pageA.goto("/");
  await expect(pageA.getByRole("article", { name: TITLE })).toHaveCount(2, { timeout: 30_000 });
});

test("un fichier qui n'est pas une activité est refusé avec un message clair", async () => {
  await pageA.locator('input[type="file"]').setInputFiles({ name: "x.toccata", mimeType: "application/zip", buffer: Buffer.from("pas une archive") });
  await expect(pageA.getByRole("alert")).toContainText(/fichier d’activité Toccata|n’est pas/, { timeout: 15_000 });
  await pageA.context().close();
});
