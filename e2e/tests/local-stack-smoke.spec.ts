import { expect, test } from "@playwright/test";

// Fumée de la pile « serveur de classe » réelle (Caddy + service d'authentification en mode local + CouchDB), lancée à part :
//   cd apps/local-server && docker compose up -d --build   puis   LOCAL_STACK_URL=https://classe.example.org pnpm e2e
// Sans cette variable, le test est ignoré (la pile exige Docker, des secrets et un amont).
const url = process.env["LOCAL_STACK_URL"];
test.skip(!url, "LOCAL_STACK_URL non défini : pile du serveur de classe non lancée");
test.use({ locale: "fr-FR", ignoreHTTPSErrors: true });

test("la pile du serveur de classe sert l'interface sans violation de politique de sécurité, et se déclare en mode local", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  const csp: string[] = [];
  page.on("response", (r) => r.url().endsWith("/login") && csp.push(r.headers()["content-security-policy"] ?? ""));

  await page.goto(`${url}/login`);
  await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();
  expect(problems.filter((p) => /Content Security Policy|CSP|Refused to/i.test(p))).toEqual([]);

  const info = await page.evaluate(async () => (await fetch("/api/server-info")).json());
  expect(info).toMatchObject({ mode: "local" });

  // le service worker prend la main (coque hors ligne) : HTTPS ou localhost obligatoire
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  expect(sw).toBe(true);

  // CouchDB n'est atteint que par /couch, et exige un jeton
  expect((await page.request.get(`${url}/couch/_all_dbs`)).status()).toBe(401);
  // et l'inscription d'un enseignant est refusée en classe : les comptes se gèrent sur le cloud
  const signup = await page.request.post(`${url}/api/auth/teachers`, { data: { username: "x.y.z", displayName: "X", password: "Tb9#kLm2-vq8Zr!xW" } });
  expect(signup.status()).toBe(503);
});
