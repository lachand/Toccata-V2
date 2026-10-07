import { expect, test, type Browser, type Page } from "@playwright/test";

// Primo-scripting : un enseignant écrit un script, le retrouve sur un autre appareil, et modifie hors ligne (D2, D3, D4).
test.describe.configure({ mode: "serial" });
test.use({ locale: "fr-FR" });

const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const username = `scr.${Date.now().toString(36)}`;

async function device(browser: Browser) {
  const context = await browser.newContext({ locale: "fr-FR" });
  return { context, page: await context.newPage() };
}
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
}
async function renameSelectedStep(page: Page, title: string, from = "Nouvelle étape") {
  const field = page.getByLabel("Titre de l’étape");
  await expect(field).toHaveValue(from); // la sélection suit l'ajout : on attend le bon champ avant d'écrire
  await field.fill(title);
  await field.blur();
}

test("l'enseignant écrit un script ; un autre appareil le retrouve dans le même ordre", async ({ browser }) => {
  const a = await device(browser);
  await a.page.goto("/signup");
  await a.page.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await a.page.getByLabel("Identifiant").fill(username);
  await a.page.getByLabel("Mot de passe").fill(PASSWORD);
  await a.page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(a.page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();

  await a.page.getByRole("button", { name: "Nouvelle activité" }).first().click();
  await a.page.getByLabel("Titre", { exact: true }).fill("Atelier Agile");
  await a.page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(a.page.getByRole("heading", { level: 1, name: "Atelier Agile" })).toBeVisible();

  await a.page.getByRole("button", { name: "Ajouter la première étape" }).click();
  await renameSelectedStep(a.page, "Brainstorm");
  await a.page.getByRole("button", { name: "Ajouter une étape" }).click();
  await renameSelectedStep(a.page, "Rétrospective");
  await a.page.getByRole("button", { name: "Ajouter une étape" }).click();
  await renameSelectedStep(a.page, "Bonus");
  await a.page.getByRole("switch", { name: "Visible par les élèves" }).click(); // l'œil : masquée
  await a.page.getByRole("button", { name: "Déplacer avant" }).click();
  await expect(a.page.getByRole("list", { name: "Étapes" }).getByRole("listitem")).toHaveText([/Brainstorm/, /Bonus/, /Rétrospective/, ""]);

  // autre appareil : mêmes identifiants, base locale vide → le script arrive par la synchronisation
  const b = await device(browser);
  await signIn(b.page);
  const card = b.page.getByRole("article", { name: "Atelier Agile" });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("3 étapes")).toBeVisible({ timeout: 30_000 });
  await card.getByRole("link", { name: "Modifier" }).click();
  await expect(b.page.getByRole("list", { name: "Étapes" }).getByRole("listitem")).toHaveText([/Brainstorm/, /Bonus/, /Rétrospective/, ""]);
  await expect(b.page.getByRole("button", { name: /Montrer « Bonus » aux élèves/ })).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test("une modification faite hors ligne est conservée puis synchronisée au retour du réseau", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page);
  await a.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  await expect(a.page.getByRole("list", { name: "Étapes" }).getByRole("listitem").first()).toContainText("Brainstorm");

  await a.context.setOffline(true);
  await a.page.getByRole("button", { name: "Brainstorm", exact: true }).click();
  await renameSelectedStep(a.page, "Remue-méninges", "Brainstorm");
  await expect(a.page.getByRole("list", { name: "Étapes" }).getByRole("listitem").first()).toContainText("Remue-méninges");
  await a.page.reload().catch(() => undefined); // hors ligne : la coque et les données locales suffisent (le service worker sert la page)
  await a.context.setOffline(false);

  const b = await device(browser);
  await signIn(b.page);
  await b.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  await expect(b.page.getByRole("list", { name: "Étapes" }).getByRole("listitem").first()).toContainText("Remue-méninges", { timeout: 45_000 });
  await a.context.close();
  await b.context.close();
});

test("réordonner au clavier (glisser-déposer accessible) et écrire une consigne en texte riche", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page);
  await a.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  const items = a.page.getByRole("list", { name: "Étapes" }).getByRole("listitem");
  await expect(items.nth(2)).toContainText("Rétrospective");

  // poignée de la 3e étape : espace pour saisir, flèche gauche, espace pour déposer
  const handle = items.nth(2).getByRole("button", { name: "Glisser pour réordonner" });
  await handle.focus();
  await a.page.keyboard.press("Space");
  await a.page.waitForTimeout(250); // dnd-kit installe ses écouteurs à l'image suivante
  await a.page.keyboard.press("ArrowLeft");
  await a.page.waitForTimeout(250);
  await a.page.keyboard.press("Space");
  await expect(items.nth(1)).toContainText("Rétrospective");

  await a.page.getByRole("button", { name: "Rétrospective", exact: true }).click();
  const editor = a.page.getByRole("textbox", { name: "Consigne" });
  await editor.click();
  await a.page.getByRole("button", { name: "Gras" }).click();
  await a.page.keyboard.type("Important");
  await a.page.getByRole("button", { name: "Gras" }).click();
  await a.page.keyboard.type(" : lisez <script>alert(1)</script> bien.");
  await a.page.getByLabel("Titre de l’étape").click(); // sortie du champ : enregistrement
  await a.page.reload();
  await a.page.getByRole("button", { name: "Rétrospective", exact: true }).click();
  const again = a.page.getByRole("textbox", { name: "Consigne" });
  await expect(again.locator("strong")).toHaveText("Important");
  await expect(again).toContainText("lisez");
  expect(await again.locator("script").count()).toBe(0);
  await a.context.close();
});
