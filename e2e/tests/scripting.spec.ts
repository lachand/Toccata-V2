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
  await expect(b.page.getByRole("button", { name: /Montrer « Bonus » aux élèves/ })).toBeVisible({ timeout: 30_000 });
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
  await a.page.getByRole("toolbar", { name: "Mise en forme du texte" }).first().waitFor(); // TipTap est chargé à la demande
  const editor = a.page.getByRole("textbox", { name: "Consigne" });
  await editor.click();
  await a.page.keyboard.press("Control+b");
  await a.page.keyboard.type("Important");
  await a.page.keyboard.press("Control+b");
  await a.page.keyboard.type(" : lisez <script>alert(1)</script> bien.");
  await a.page.getByLabel("Titre de l’étape").click(); // sortie du champ : enregistrement
  await a.page.waitForTimeout(800); // l'écriture locale est asynchrone : on laisse IndexedDB la terminer avant de recharger
  await a.page.reload();
  await a.page.getByRole("button", { name: "Rétrospective", exact: true }).click();
  await a.page.getByRole("toolbar", { name: "Mise en forme du texte" }).first().waitFor();
  const again = a.page.getByRole("textbox", { name: "Consigne" });
  await expect(again.locator("strong")).toHaveText("Important");
  await expect(again).toContainText("lisez");
  expect(await again.locator("script").count()).toBe(0);
  await a.context.close();
});

// Un petit PNG de 1×1 pixel (fichier réel, envoyé à CouchDB en pièce jointe native).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("ressources : un lien, un fichier image et une application web ; le fichier arrive sur un autre appareil", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page);
  await a.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  const panel = a.page.getByRole("region", { name: "Ressources et applications de toute l’activité" });

  await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
  let dialog = a.page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Lien web/ }).click();
  await dialog.getByLabel("Adresse").fill("https://fr.wikipedia.org/wiki/Accueil");
  await dialog.getByLabel("Nom").fill("Wikipédia");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(panel.locator('input[value="Wikipédia"]')).toBeVisible();

  await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
  dialog = a.page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Fichier/ }).click();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(panel.locator('input[value="pixel.png"]')).toBeVisible();
  await panel.getByRole("button", { name: "Afficher pixel.png" }).click();
  await expect(panel.getByRole("img", { name: "pixel.png" })).toBeVisible();

  await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
  dialog = a.page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Application web/ }).click();
  await dialog.getByLabel("Adresse").fill("https://framacalc.org/abc");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(panel.locator('input[value="Application web"]')).toBeVisible();

  // autre appareil : le document de ressource arrive par la réplication, le contenu du fichier par la pièce jointe CouchDB
  const b = await device(browser);
  await signIn(b.page);
  await b.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  const panelB = b.page.getByRole("region", { name: "Ressources et applications de toute l’activité" });
  await expect(panelB.locator('input[value="pixel.png"]')).toBeVisible({ timeout: 30_000 });
  await panelB.getByRole("button", { name: "Afficher pixel.png" }).click();
  const img = panelB.getByRole("img", { name: "pixel.png" });
  await expect(img).toBeVisible({ timeout: 30_000 });
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  await a.context.close();
  await b.context.close();
});

test("applications : chrono, kanban, texte partagé et questionnaire s'ajoutent, se configurent et s'essaient dans l'aperçu", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page);
  await a.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  await a.page.getByRole("button", { name: "Remue-méninges", exact: true }).click();
  const panel = a.page.getByRole("region", { name: "Ressources et applications de cette étape" });
  const addApp = async (type: RegExp) => {
    await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
    const d = a.page.getByRole("dialog");
    await d.getByRole("button", { name: type }).click();
    await d.getByRole("button", { name: "Ajouter", exact: true }).click();
  };

  await addApp(/Minuteur/);
  await panel.getByRole("button", { name: "Afficher Minuteur" }).click();
  await expect(panel.getByRole("time")).toContainText("05:00");
  await panel.getByRole("button", { name: "Démarrer" }).click();
  await expect(panel.getByRole("button", { name: "Pause" })).toBeVisible();
  await a.page.waitForTimeout(1300);
  await expect(panel.getByRole("time")).not.toContainText("05:00");
  await panel.getByRole("button", { name: "Pause" }).click();
  await panel.getByRole("button", { name: "Masquer Minuteur" }).click();

  await addApp(/Tableau kanban/);
  await panel.getByRole("button", { name: "Afficher Tableau kanban" }).click();
  const todo = panel.getByRole("region", { name: "À faire" });
  await todo.getByRole("textbox", { name: /Nouvelle carte dans/ }).fill("Écrire le plan");
  await todo.getByRole("textbox", { name: /Nouvelle carte dans/ }).press("Enter");
  await expect(todo.locator('input[value="Écrire le plan"]')).toBeVisible();
  await todo.getByRole("combobox", { name: /Déplacer/ }).selectOption({ label: "Terminé" });
  await expect(panel.getByRole("region", { name: "Terminé" }).locator('input[value="Écrire le plan"]')).toBeVisible();
  await panel.getByRole("button", { name: "Masquer Tableau kanban" }).click();

  await addApp(/Texte partagé/);
  await panel.getByRole("button", { name: "Afficher Texte partagé" }).click();
  const shared = panel.getByRole("textbox", { name: "Texte partagé" });
  await shared.click();
  await a.page.keyboard.type("Notes de groupe");
  await expect(shared).toContainText("Notes de groupe");
  await panel.getByRole("button", { name: "Masquer Texte partagé" }).click();

  await addApp(/Questionnaire/);
  await panel.getByRole("button", { name: "Afficher Questionnaire" }).click();
  await panel.getByRole("button", { name: "Ajouter une question" }).click();
  await panel.getByLabel("Question", { exact: true }).fill("Qu’as-tu retenu ?");
  await expect(panel.getByRole("textbox", { name: /Qu’as-tu retenu/ })).toBeVisible();
  await panel.getByRole("button", { name: "Envoyer" }).click();
  await expect(panel.getByText("Réponses envoyées.")).toBeVisible();

  // l'étape peut être bloquée par le questionnaire
  await a.page.getByLabel("Étape bloquée jusqu’à l’envoi d’un questionnaire").selectOption({ label: "Questionnaire" });

  // autre appareil : les applications (leur configuration) sont répliquées ; les données d'aperçu restent locales
  const b = await device(browser);
  await signIn(b.page);
  await b.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  await b.page.getByRole("button", { name: "Remue-méninges", exact: true }).click();
  const pb = b.page.getByRole("region", { name: "Ressources et applications de cette étape" });
  for (const n of ["Minuteur", "Tableau kanban", "Texte partagé", "Questionnaire"]) await expect(pb.locator(`input[value="${n}"]`)).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByLabel("Étape bloquée jusqu’à l’envoi d’un questionnaire")).toHaveValue(/.+/, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});

test("notes privées synchronisées entre appareils, et éditeur sans débordement à 360 px", async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page);
  await a.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  await a.page.getByRole("button", { name: "Remue-méninges", exact: true }).click();
  const stepNotes = a.page.getByRole("region", { name: "Notes sur cette étape" });
  await stepNotes.getByLabel("Notes privées").fill("Prévoir 10 minutes de plus");
  await stepNotes.getByLabel("Notes privées").blur();
  await stepNotes.getByRole("button", { name: "À améliorer" }).click();
  await expect(stepNotes.getByRole("button", { name: "À améliorer" })).toHaveAttribute("aria-pressed", "true");

  const b = await device(browser);
  await signIn(b.page);
  await b.page.getByRole("article", { name: "Atelier Agile" }).getByRole("link", { name: "Modifier" }).click();
  await b.page.getByRole("button", { name: "Remue-méninges", exact: true }).click();
  const notesB = b.page.getByRole("region", { name: "Notes sur cette étape" });
  await expect(notesB.getByLabel("Notes privées")).toHaveValue("Prévoir 10 minutes de plus", { timeout: 30_000 });
  await expect(notesB.getByRole("button", { name: "À améliorer" })).toHaveAttribute("aria-pressed", "true");

  // aucun débordement horizontal de la page à 360 px, avec un kanban et un questionnaire ouverts
  await b.page.setViewportSize({ width: 360, height: 740 });
  const panel = b.page.getByRole("region", { name: "Ressources et applications de cette étape" });
  await panel.getByRole("button", { name: "Afficher Tableau kanban" }).click();
  await panel.getByRole("button", { name: "Afficher Questionnaire" }).click();
  await panel.getByRole("button", { name: "Afficher Minuteur" }).click();
  const overflow = await b.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await a.context.close();
  await b.context.close();
});
