import { expect, test, type Page } from "@playwright/test";

/** Attend que le service worker contrôle la page (il l'installe au premier chargement, la contrôle au suivant). */
async function installOffline(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test.describe("hors ligne (D3 de l'article)", () => {
  test.use({ locale: "fr-FR" });

  test("l'application se recharge sans réseau et change de langue", async ({ page, context }) => {
    await installOffline(page);
    await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Mes activités" })).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Hors ligne");

    // le catalogue anglais était précaché : changer de langue fonctionne sans réseau
    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "My activities" })).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Offline, your changes are kept");

    // navigation directe vers une autre route hors ligne (repli sur la coque)
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { level: 1, name: "Components" })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole("status").first()).toContainText("Online");
  });
});

test.describe("langues", () => {
  for (const [locale, title] of [["fr-FR", "Mes activités"], ["en-US", "My activities"], ["de-DE", "Mes activités"]] as const) {
    test(`navigateur en ${locale} → « ${title} »`, async ({ browser }) => {
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await context.close();
    });
  }

  test("le choix de langue survit au rechargement", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("radio", { name: "Français" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mes activités");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mes activités");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await context.close();
  });

  // Deux cas : polices chargées, et polices bloquées (hors ligne sans cache de polices : texte plus large avec la police de repli).
  for (const fonts of ["avec polices", "polices de repli"] as const) {
    test(`fr et en tiennent sans débordement horizontal à 360 px (${fonts})`, async ({ browser }) => {
      for (const locale of ["fr-FR", "en-US"]) {
        const context = await browser.newContext({ locale, viewport: { width: 360, height: 740 } });
        if (fonts === "polices de repli") await context.route(/\.woff2/, (r) => r.abort());
        const page = await context.newPage();
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${locale} (${fonts}) déborde de ${overflow}px`).toBeLessThanOrEqual(0);
        await context.close();
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
