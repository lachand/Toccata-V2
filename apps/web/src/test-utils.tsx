import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { useEffect, useState, type ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { Layout } from "./components/Layout";
import { AppRoutes } from "./routes";
import { type Locale, activateLocale } from "./i18n";

function Harness({ initial, children }: { initial: Locale; children: (l: Locale) => ReactElement }) {
  const [locale, setLocale] = useState<Locale>(initial);
  useEffect(() => i18n.on("change", () => setLocale(i18n.locale as Locale)), []);
  return (
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <Layout>{children(locale)}</Layout>
      </MemoryRouter>
    </I18nProvider>
  );
}

export async function renderIn(locale: Locale, ui: (l: Locale) => ReactElement) {
  await activateLocale(locale, false);
  return render(<Harness initial={locale}>{ui}</Harness>);
}

/** Application complète (vraies routes, vrai Layout) dans un routeur en mémoire. */
export async function renderApp(locale: Locale, at = "/") {
  await activateLocale(locale, false);
  function AppHarness() {
    const [l, setL] = useState<Locale>(locale);
    useEffect(() => i18n.on("change", () => setL(i18n.locale as Locale)), []);
    return (
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[at]}>
          <AppRoutes locale={l} />
        </MemoryRouter>
      </I18nProvider>
    );
  }
  return render(<AppHarness />);
}

type Handler = (body: any, init: RequestInit) => { status?: number; json?: unknown } | Promise<{ status?: number; json?: unknown }>;

/** Remplace `fetch` par une table de routes `"METHODE /chemin"`. Renvoie les appels pour les vérifier. */
export function stubApi(routes: Record<string, Handler>) {
  const calls: { key: string; body: any; headers: Headers }[] = [];
  const fn = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, "");
    const key = `${(init.method ?? "GET").toUpperCase()} ${path}`;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ key, body, headers: new Headers(init.headers) });
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    const r = await h(body, init);
    return r.status === 204 ? new Response(null, { status: 204 }) : new Response(JSON.stringify(r.json ?? null), { status: r.status ?? 200 });
  };
  vi.stubGlobal("fetch", fn);
  return calls;
}

export const teacher = { id: "t1", role: "teacher" as const, username: "marie", displayName: "Marie Durand", locale: "fr" as const };
export const student = { id: "s1", role: "student" as const, username: "lina.a", displayName: "Lina Aubert", locale: "fr" as const };
export const tokenFor = (user: typeof teacher | typeof student) => ({ status: 200, json: { accessToken: `tok-${user.id}`, expiresIn: 900, user } });

import { session } from "./auth/session";

/** Remet la session globale à zéro entre deux tests. */
export async function resetSession() {
  stubApi({ "POST /api/auth/logout": () => ({ status: 204 }) });
  await session.logout();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
}
