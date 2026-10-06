import { expect, test, type Browser, type Page } from "@playwright/test";

// Parcours réel : navigateur → interface → service d'authentification → CouchDB.
test.describe.configure({ mode: "serial" });
test.use({ locale: "fr-FR" });

const PASSWORD = "correct horse battery staple";
const unique = Date.now().toString(36);
const teacherName = `prof.${unique}`;

let students: { name: string; username: string; passphrase: string }[] = [];

async function newPage(browser: Browser) {
  const context = await browser.newContext({ locale: "fr-FR" });
  return { context, page: await context.newPage() };
}

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test("un enseignant s'inscrit, retrouve sa session après rechargement, crée une classe et des élèves", async ({ browser }) => {
  const { context, page } = await newPage(browser);
  await page.goto("/signup");
  await page.getByLabel("Nom affiché aux élèves").fill("Marie Durand");
  await page.getByLabel("Identifiant").fill(teacherName);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();

  // la session survit au rechargement (cookie de rafraîchissement, jeton d'accès en mémoire)
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/eyJ/); // aucun jeton dans localStorage

  await page.getByRole("link", { name: "Classes" }).click();
  await page.getByRole("button", { name: "Nouvelle classe" }).first().click();
  await page.getByLabel("Nom de la classe").fill("4e B");
  await page.getByRole("button", { name: "Créer la classe" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "4e B" })).toBeVisible();

  await page.getByLabel("Noms des élèves").fill("Lina Aubert\nHugo Martin");
  await page.getByRole("button", { name: "Créer les comptes" }).click();
  const sheet = page.getByRole("region", { name: "Identifiants de connexion" });
  await expect(sheet).toBeVisible();
  const cards = sheet.locator(".cred-card");
  await expect(cards).toHaveCount(2);
  students = [];
  for (let i = 0; i < 2; i++) {
    const text = (await cards.nth(i).innerText()).replace(/\s+/g, " ");
    const name = i === 0 ? "Lina Aubert" : "Hugo Martin";
    const username = /Identifiant\s+(\S+)/.exec(text)![1]!;
    const passphrase = /Phrase de passe\s+(\S+)/.exec(text)![1]!;
    expect(passphrase).toMatch(/^[a-z]+(-[a-z]+){3}$/);
    students.push({ name, username, passphrase });
  }
  expect(students.map((s) => s.username)).toEqual(["lina.a", "hugo.m"]);

  // une fois la fiche fermée, plus aucune trace des phrases de passe dans la page
  await sheet.getByRole("button", { name: "Terminé" }).click();
  await expect(page.getByText(students[0]!.passphrase)).toHaveCount(0);
  await context.close();
});

test("un élève se connecte (graphie libre), n'a pas accès aux pages d'enseignant, garde sa session, puis se déconnecte pour de bon", async ({ browser }) => {
  const { context, page } = await newPage(browser);
  const s = students[0]!;
  // majuscules et espaces au lieu de tirets : accepté
  await signIn(page, s.username.toUpperCase(), s.passphrase.toUpperCase().replace(/-/g, "  "));
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Classes" })).toHaveCount(0);

  await page.goto("/classes");
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible(); // renvoyé à l'accueil

  const api = await page.evaluate(async () => (await fetch("/api/classes")).status);
  expect(api).toBe(401); // sans jeton, le serveur refuse ; avec le jeton d'un élève ce serait 403 (testé en intégration)

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible(); // le cookie a été révoqué
  await context.close();
});

test("un mauvais mot de passe est refusé sans rien révéler, et les échecs répétés verrouillent temporairement", async ({ browser }) => {
  const { context, page } = await newPage(browser);
  const s = students[1]!;
  await signIn(page, s.username, "faux-faux-faux-faux");
  await expect(page.getByRole("alert")).toHaveText("Identifiant ou mot de passe incorrect.");
  await signIn(page, "inconnu.total", "faux-faux-faux-faux");
  await expect(page.getByRole("alert")).toHaveText("Identifiant ou mot de passe incorrect."); // même message : on ne devine pas les comptes
  await page.getByLabel("Identifiant").fill(s.username); // le champ contient encore l'identifiant inconnu
  for (let i = 0; i < 4; i++) {
    await page.getByLabel("Mot de passe").fill("encore-faux-" + i);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  }
  await page.getByLabel("Mot de passe").fill(s.passphrase); // même le bon mot de passe est refusé pendant le verrouillage
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("Trop de tentatives");
  await context.close();
});

test("l'enseignant réinitialise la phrase de passe d'un élève : l'ancienne ne marche plus, la nouvelle oui (QR de connexion rapide)", async ({ browser }) => {
  const teacher = await newPage(browser);
  await signIn(teacher.page, teacherName, PASSWORD);
  await teacher.page.getByRole("link", { name: "Classes" }).click();
  await teacher.page.getByRole("link", { name: "Ouvrir" }).first().click();
  await teacher.page.getByRole("button", { name: "Nouvelle phrase de passe pour Hugo Martin" }).click();
  const sheet = teacher.page.getByRole("region", { name: "Identifiants de connexion" });
  const card = sheet.locator(".cred-card").first();
  await expect(card).toBeVisible();
  const fresh = /Phrase de passe\s+(\S+)/.exec((await card.innerText()).replace(/\s+/g, " "))![1]!;
  expect(fresh).not.toBe(students[1]!.passphrase);
  await teacher.context.close();

  const old = await newPage(browser);
  await signIn(old.page, students[1]!.username, students[1]!.passphrase);
  await expect(old.page.getByRole("alert")).toBeVisible(); // ancienne phrase refusée (ou compte encore verrouillé par le test précédent : refusé dans les deux cas)
  await old.context.close();

  // connexion rapide comme avec le QR code : le fragment est lu puis effacé de l'adresse
  const quick = await newPage(browser);
  // le compte a pu être verrouillé par le test précédent : la réinitialisation lève le verrouillage
  await quick.page.goto(`/login#u=${students[1]!.username}&p=${fresh}`);
  await expect(quick.page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  expect(quick.page.url()).not.toContain("#");
  expect(quick.page.url()).not.toContain(fresh);
  await quick.context.close();
});

test("hors ligne, l'enseignant garde son application ; les pages qui exigent le serveur le disent et se rétablissent", async ({ browser }) => {
  const { context, page } = await newPage(browser);
  await signIn(page, teacherName, PASSWORD);
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload(); // le cookie ne peut pas être échangé : on ouvre la session depuis le profil en cache
  await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("Hors ligne");

  await page.getByRole("link", { name: "Classes" }).click();
  await expect(page.getByRole("alert")).toContainText("Serveur injoignable");

  await context.setOffline(false);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("article", { name: "4e B" })).toBeVisible();
  await context.close();
});
