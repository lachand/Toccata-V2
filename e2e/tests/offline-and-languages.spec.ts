import { expect, test, type Page } from "@playwright/test";

/** Attend que le service worker contrôle la page (il l'installe au premier chargement, la contrôle au suivant). */
async function installOffline(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test.describe("hors ligne (D3 de l'article), page de connexion", () => {
  test.use({ locale: "fr-FR" });

  test("la page se recharge sans réseau et change de langue (catalogue anglais précaché)", async ({ page, context }) => {
    await installOffline(page, "/login");
    await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();

    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

    // sans réseau, la connexion échoue proprement avec un message, sans planter
    await page.getByLabel("Username").fill("quelquun");
    await page.getByLabel("Password").fill("x");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Server unreachable");
    await context.setOffline(false);
  });
});

test.describe("langues", () => {
  for (const [locale, title] of [["fr-FR", "Se connecter"], ["en-US", "Sign in"], ["de-DE", "Se connecter"]] as const) {
    test(`navigateur en ${locale} → « ${title} »`, async ({ browser }) => {
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.goto("/login");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await context.close();
    });
  }

  test("le choix de langue survit au rechargement", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByRole("radio", { name: "Français" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await context.close();
  });

  // Deux cas : polices chargées, et polices bloquées (hors ligne sans cache de polices : texte plus large avec la police de repli).
  for (const fonts of ["avec polices", "polices de repli"] as const) {
    test(`fr et en tiennent sans débordement horizontal à 360 px (${fonts})`, async ({ browser }) => {
      for (const locale of ["fr-FR", "en-US"]) {
        for (const path of ["/login", "/signup"]) {
          const context = await browser.newContext({ locale, viewport: { width: 360, height: 740 } });
          if (fonts === "polices de repli") await context.route(/\.woff2/, (r) => r.abort());
          const page = await context.newPage();
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${locale} ${path} (${fonts}) déborde de ${overflow}px`).toBeLessThanOrEqual(0);
          await context.close();
        }
      }
    });
  }
});

test("le manifeste et les icônes sont servis", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
});

test("une route d'API n'est jamais remplacée par l'interface (le service worker ne la capture pas)", async ({ request }) => {
  const res = await request.get("/api/auth/me");
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});
