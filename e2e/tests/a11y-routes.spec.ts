import { expect, test, type Browser, type Page } from "@playwright/test";
import { createRequire } from "node:module";

// Accessibilité (axe-core, WCAG 2.x A/AA hors contraste, vérifié à part par `check-contrast`) de TOUTES les pages, en français et en anglais,
// puis absence de débordement horizontal à 360 px et parcours au clavier.
test.describe.configure({ mode: "serial" });

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const username = `a11y.${Date.now().toString(36)}`;
const ids = { activity: "", cls: "" };

async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run(document, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
}
async function open(browser: Browser, locale: "fr-FR" | "en-US", width = 1280): Promise<Page> {
  const ctx = await browser.newContext({ locale, viewport: { width, height: 900 } });
  return ctx.newPage();
}
async function signIn(page: Page, locale: "fr-FR" | "en-US") {
  await page.goto("/login");
  await page.getByLabel(locale === "fr-FR" ? "Identifiant" : "Username").fill(username);
  await page.getByLabel(locale === "fr-FR" ? "Mot de passe" : "Password").fill(PASSWORD);
  await page.getByRole("button", { name: locale === "fr-FR" ? "Se connecter" : "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
}

test("préparation : un enseignant, une classe, une activité à une étape, un groupe", async ({ browser }) => {
  const page = await open(browser, "fr-FR");
  await page.goto("/signup");
  await page.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  await page.getByRole("link", { name: "Classes" }).click();
  await page.getByRole("button", { name: "Nouvelle classe" }).first().click();
  await page.getByLabel("Nom de la classe").fill("A11y");
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await page.getByLabel("Noms des élèves").fill("Zoé Nguyen");
  await page.getByRole("button", { name: "Créer les comptes" }).click();
  await page.getByRole("button", { name: "Terminé" }).click();
  ids.cls = /\/classes\/([^/?]+)/.exec(page.url())![1]!;
  await page.getByRole("link", { name: "Mes activités" }).click();
  await page.getByRole("button", { name: "Nouvelle activité" }).first().click();
  await page.getByLabel("Titre", { exact: true }).fill("Activité accessible");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter la première étape" }).click();
  const title = page.getByLabel("Titre de l’étape");
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Observer");
  await title.blur();
  await page.waitForTimeout(800);
  ids.activity = /\/activities\/([^/?]+)/.exec(page.url())![1]!;
  await page.getByRole("link", { name: "Distribuer" }).click();
  await page.getByRole("radio", { name: "Un par élève" }).check();
  await page.getByRole("button", { name: "Créer les groupes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Groupes de cette activité" }).getByLabel("Nom du groupe")).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.context().close();
});

for (const locale of ["fr-FR", "en-US"] as const) {
  test(`axe : toutes les pages enseignant (${locale})`, async ({ browser }) => {
    const page = await open(browser, locale);
    await page.goto("/login");
    expect(await violations(page), "/login").toEqual([]);
    await page.goto("/signup");
    expect(await violations(page), "/signup").toEqual([]);
    await signIn(page, locale);
    const paths = ["/", "/classes", `/classes/${ids.cls}`, "/library", "/privacy", "/gallery", `/activities/${ids.activity}`, `/activities/${ids.activity}/distribute`, `/activities/${ids.activity}/monitor`, `/activities/${ids.activity}/review`, `/remote/${ids.activity}`];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      expect(await violations(page), `${path} (${locale})`).toEqual([]);
    }
    await page.context().close();
  });
}

test("360 px : aucune page ne déborde horizontalement", async ({ browser }) => {
  const page = await open(browser, "fr-FR", 360);
  await signIn(page, "fr-FR");
  for (const path of ["/", "/classes", `/classes/${ids.cls}`, "/library", "/privacy", `/activities/${ids.activity}`, `/activities/${ids.activity}/review`, `/activities/${ids.activity}/monitor`]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.context().close();
});

test("clavier : connexion, ouverture et fermeture d'une boîte de dialogue sans souris", async ({ browser }) => {
  const page = await open(browser, "fr-FR");
  await page.goto("/login");
  await page.getByLabel("Identifiant").focus();
  await page.keyboard.type(username);
  await page.keyboard.press("Tab");
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible({ timeout: 30_000 });
  const open_ = page.getByRole("button", { name: "Nouvelle activité" }).first();
  await open_.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Titre", { exact: true })).toBeFocused(); // le focus entre dans la boîte de dialogue
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open_).toBeFocused(); // et revient à son point de départ
  await page.context().close();
});
