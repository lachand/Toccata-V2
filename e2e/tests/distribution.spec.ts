import { expect, test, type Browser, type Page } from "@playwright/test";

// Parcours complet de la Phase 4 : l'enseignant prépare et distribue ; les élèves jouent, chacun dans son groupe ; reprise sur un autre appareil.
test.describe.configure({ mode: "serial" });
test.use({ locale: "fr-FR" });

const PASSWORD = "Tb9#kLm2-vq8Zr!xW";
const teacherName = `dist.${Date.now().toString(36)}`;
let students: { name: string; username: string; passphrase: string }[] = [];

async function device(browser: Browser) {
  const context = await browser.newContext({ locale: "fr-FR" });
  return { context, page: await context.newPage() };
}
async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
}

test("l'enseignant crée une classe, écrit un script avec un kanban et un questionnaire bloquant, puis le distribue", async ({ browser }) => {
  const { context, page } = await device(browser);
  await page.goto("/signup");
  await page.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await page.getByLabel("Identifiant").fill(teacherName);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();

  // classe de deux élèves
  await page.getByRole("link", { name: "Classes" }).click();
  await page.getByRole("button", { name: "Nouvelle classe" }).first().click();
  await page.getByLabel("Nom de la classe").fill("4e B");
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await page.getByLabel("Noms des élèves").fill("Lina Aubert\nHugo Martin");
  await page.getByRole("button", { name: "Créer les comptes" }).click();
  const cards = page.getByRole("region", { name: "Identifiants de connexion" }).locator(".cred-card");
  await expect(cards).toHaveCount(2);
  students = [];
  for (let i = 0; i < 2; i++) {
    const text = (await cards.nth(i).innerText()).replace(/\s+/g, " ");
    students.push({ name: i === 0 ? "Lina Aubert" : "Hugo Martin", username: /Identifiant\s+(\S+)/.exec(text)![1]!, passphrase: /Phrase de passe\s+(\S+)/.exec(text)![1]! });
  }
  await page.getByRole("region", { name: "Identifiants de connexion" }).getByRole("button", { name: "Terminé" }).click();

  // activité : deux étapes ; la première porte un kanban et un questionnaire qui bloque la suite
  await page.getByRole("link", { name: "Mes activités" }).click();
  await page.getByRole("button", { name: "Nouvelle activité" }).first().click();
  await page.getByLabel("Titre", { exact: true }).fill("Atelier distribué");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter la première étape" }).click();
  const title = page.getByLabel("Titre de l’étape");
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Réfléchir");
  await title.blur();
  await page.getByRole("button", { name: "Ajouter une étape" }).click();
  await expect(title).toHaveValue("Nouvelle étape");
  await title.fill("Conclure");
  await title.blur();
  await page.getByRole("button", { name: "Réfléchir", exact: true }).click();
  const panel = page.getByRole("region", { name: "Ressources et applications de cette étape" });
  for (const type of [/Tableau kanban/, /Questionnaire/]) {
    await panel.getByRole("button", { name: "Ajouter", exact: true }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: type }).click();
    await d.getByRole("button", { name: "Ajouter", exact: true }).click();
  }
  await panel.getByRole("button", { name: "Afficher Questionnaire" }).click();
  await panel.getByRole("button", { name: "Ajouter une question" }).click();
  await panel.getByLabel("Question", { exact: true }).fill("Qu’as-tu retenu ?");
  await page.waitForTimeout(700); // la configuration de l'application s'enregistre après un court délai
  await page.getByLabel("Étape bloquée jusqu’à l’envoi d’un questionnaire").selectOption({ label: "Questionnaire" });

  // distribution : un groupe par élève
  await page.getByRole("link", { name: "Distribuer" }).click();
  await page.getByRole("radio", { name: "Un par élève" }).check();
  await page.getByRole("button", { name: "Créer les groupes", exact: true }).click();
  const groups = page.getByRole("region", { name: "Groupes de cette activité" });
  await expect(groups.getByLabel("Nom du groupe")).toHaveCount(2, { timeout: 30_000 });
  await expect(groups.locator('input[value="Lina Aubert"]')).toBeVisible();
  await page.waitForTimeout(1500); // laisse la réplication pousser les définitions
  await context.close();
});

test("un élève joue dans son groupe : kanban, questionnaire bloquant, puis reprise sur un autre appareil ; l'autre groupe ne voit rien", async ({ browser }) => {
  const [lina, hugo] = students as [typeof students[0], typeof students[0]];
  const a = await device(browser);
  await a.page.goto("/login");
  await a.page.getByLabel("Identifiant").fill(lina.username);
  await a.page.getByLabel("Mot de passe").fill(lina.passphrase);
  await a.page.getByRole("button", { name: "Se connecter" }).click();
  const card = a.page.getByRole("article", { name: "Atelier distribué" });
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.getByRole("link", { name: "Ouvrir" }).click();
  await expect(a.page.getByRole("heading", { level: 2, name: "Réfléchir" })).toBeVisible({ timeout: 45_000 });

  // la suite est retenue tant que le questionnaire n'est pas envoyé
  const next = a.page.getByRole("button", { name: "Étape suivante" });
  await expect(next).toBeDisabled();

  // un seul élément ouvert à la fois
  await a.page.getByRole("radio", { name: "Tableau kanban" }).check();
  const todo = a.page.getByRole("region", { name: "À faire" });
  await todo.getByRole("textbox", { name: /Nouvelle carte dans/ }).fill("Ma carte");
  await todo.getByRole("textbox", { name: /Nouvelle carte dans/ }).press("Enter");
  await expect(todo.locator('input[value="Ma carte"]')).toBeVisible();
  await a.page.getByRole("radio", { name: "Questionnaire" }).check();
  await expect(a.page.getByRole("region", { name: "À faire" })).toHaveCount(0);
  await a.page.getByRole("textbox", { name: /Qu’as-tu retenu/ }).fill("Beaucoup de choses");
  await a.page.getByRole("button", { name: "Envoyer" }).click();
  await expect(a.page.getByText("Réponses envoyées.")).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(a.page.getByRole("heading", { level: 2, name: "Conclure" })).toBeVisible();
  await a.page.waitForTimeout(1500); // position et données partent vers le serveur

  // autre appareil, même élève : reprise à l'étape 2, et son kanban contient sa carte
  const b = await device(browser);
  await b.page.goto("/login");
  await b.page.getByLabel("Identifiant").fill(lina.username);
  await b.page.getByLabel("Mot de passe").fill(lina.passphrase);
  await b.page.getByRole("button", { name: "Se connecter" }).click();
  await b.page.getByRole("article", { name: "Atelier distribué" }).getByRole("link", { name: "Ouvrir" }).click({ timeout: 45_000 });
  await expect(b.page.getByRole("heading", { level: 2, name: "Conclure" })).toBeVisible({ timeout: 45_000 });
  await b.page.getByRole("button", { name: "Étape précédente" }).click();
  await b.page.getByRole("radio", { name: "Tableau kanban" }).check();
  await expect(b.page.getByRole("region", { name: "À faire" }).locator('input[value="Ma carte"]')).toBeVisible({ timeout: 30_000 });

  // l'autre groupe (Hugo) n'a ni la carte ni la réponse
  const c = await device(browser);
  await c.page.goto("/login");
  await c.page.getByLabel("Identifiant").fill(hugo.username);
  await c.page.getByLabel("Mot de passe").fill(hugo.passphrase);
  await c.page.getByRole("button", { name: "Se connecter" }).click();
  await c.page.getByRole("article", { name: "Atelier distribué" }).getByRole("link", { name: "Ouvrir" }).click({ timeout: 45_000 });
  await expect(c.page.getByRole("heading", { level: 2, name: "Réfléchir" })).toBeVisible({ timeout: 45_000 });
  await expect(c.page.getByRole("button", { name: "Étape suivante" })).toBeDisabled();
  await c.page.getByRole("radio", { name: "Tableau kanban" }).check();
  await expect(c.page.getByRole("region", { name: "À faire" }).locator('input[value="Ma carte"]')).toHaveCount(0);
  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test("modification en direct ciblée : masquer une étape pour un seul groupe, pendant que son élève a la séance ouverte", async ({ browser }) => {
  const [lina, hugo] = students as [typeof students[0], typeof students[0]];
  const openRun = async (who: typeof lina) => {
    const d = await device(browser);
    await d.page.goto("/login");
    await d.page.getByLabel("Identifiant").fill(who.username);
    await d.page.getByLabel("Mot de passe").fill(who.passphrase);
    await d.page.getByRole("button", { name: "Se connecter" }).click();
    await d.page.getByRole("article", { name: "Atelier distribué" }).getByRole("link", { name: "Ouvrir" }).click({ timeout: 45_000 });
    await expect(d.page.getByRole("heading", { level: 2, name: "Réfléchir" })).toBeVisible({ timeout: 45_000 });
    return d;
  };
  const steps = (p: Page) => p.getByRole("list", { name: "Étapes" }).getByRole("listitem");

  const h = await openRun(hugo);
  const l = await openRun(lina);
  await expect(steps(h.page)).toHaveCount(2);
  await expect(steps(l.page)).toHaveCount(2);

  const t = await device(browser);
  await login(t.page, teacherName, PASSWORD);
  await t.page.getByRole("article", { name: "Atelier distribué" }).getByRole("link", { name: "Modifier" }).click();
  await t.page.getByRole("button", { name: "Conclure", exact: true }).click();
  const target = t.page.getByRole("region", { name: "Qui reçoit vos modifications" });
  await target.getByRole("radio", { name: "Groupes choisis" }).check();
  await target.getByRole("checkbox", { name: "Hugo Martin" }).check({ timeout: 30_000 });
  await t.page.getByRole("switch", { name: "Visible par les élèves" }).click();

  // seul le groupe de Hugo perd l'étape, en direct, sans recharger
  await expect(steps(h.page)).toHaveCount(1, { timeout: 45_000 });
  await expect(steps(l.page)).toHaveCount(2);

  // le script commun n'a pas bougé : l'étape y est toujours visible pour les élèves
  await expect(t.page.getByRole("switch", { name: "Visible par les élèves" })).toBeChecked();
  for (const d of [h, l, t]) await d.context.close();
});
