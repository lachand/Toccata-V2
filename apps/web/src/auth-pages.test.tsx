import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "./auth/session";
import { renderApp, resetSession, student, stubApi, teacher, tokenFor } from "./test-utils";

beforeEach(resetSession);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const anonymous = { "POST /api/auth/refresh": () => ({ status: 401, json: { error: "invalid_refresh" } }) };
async function loggedIn(user: typeof teacher | typeof student, extra: Parameters<typeof stubApi>[0] = {}) {
  const calls = stubApi({ "POST /api/auth/refresh": () => tokenFor(user), "POST /api/auth/logout": () => ({ status: 204 }), ...extra });
  await session.bootstrap();
  return calls;
}
async function noAxeViolations(container: Element) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

describe("gardes de routes", () => {
  it("renvoie un visiteur anonyme vers la connexion", async () => {
    stubApi(anonymous);
    await session.bootstrap();
    await renderApp("fr", "/classes");
    expect(await screen.findByRole("heading", { level: 1, name: "Se connecter" })).toBeInTheDocument();
  });

  it("renvoie un utilisateur connecté qui ouvre /login à l'accueil", async () => {
    await loggedIn(teacher);
    await renderApp("fr", "/login");
    expect(await screen.findByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
  });

  it("interdit les pages d'enseignant à un élève et ne lui montre pas le menu Classes", async () => {
    await loggedIn(student);
    await renderApp("fr", "/classes");
    expect(await screen.findByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Classes" })).toBeNull();
  });

  it("montre le menu Classes à un enseignant et sa déconnexion", async () => {
    await loggedIn(teacher, { "GET /api/classes": () => ({ json: [] }) });
    await renderApp("fr", "/");
    expect(await screen.findByRole("link", { name: "Classes" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Se connecter" })).toBeInTheDocument();
    expect(session.getState().status).toBe("anonymous");
  });

  it("ouvre l'application hors ligne depuis le profil en cache", async () => {
    localStorage.setItem("toccata.profile", JSON.stringify(teacher));
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    await session.bootstrap();
    await renderApp("fr", "/");
    expect(await screen.findByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
    expect(session.getState()).toMatchObject({ status: "authenticated", offline: true });
  });
});

describe.each([
  ["fr", { title: "Se connecter", user: "Identifiant", pass: "Mot de passe", bad: "Identifiant ou mot de passe incorrect.", net: /Serveur injoignable/, locked: "Trop de tentatives. Nouvel essai possible dans 2 minutes." }],
  ["en", { title: "Sign in", user: "Username", pass: "Password", bad: "Incorrect username or password.", net: /Server unreachable/, locked: "Too many attempts. Try again in 2 minutes." }],
] as const)("connexion (%s)", (locale, x) => {
  const submit = () => userEvent.click(screen.getByRole("button", { name: x.title }));
  const fill = async (u: string, p: string) => {
    await userEvent.type(screen.getByLabelText(x.user), u);
    await userEvent.type(screen.getByLabelText(x.pass), p);
  };

  it("est accessible et traduite", async () => {
    stubApi(anonymous);
    await session.bootstrap();
    const { container } = await renderApp(locale, "/login");
    expect(await screen.findByRole("heading", { level: 1, name: x.title })).toBeInTheDocument();
    await noAxeViolations(container);
  });

  it("signale un mot inconnu d'une phrase de passe avant l'envoi, puis laisse passer au second essai", async () => {
    const calls = stubApi({ ...anonymous, "POST /api/auth/login": () => tokenFor(teacher) });
    await session.bootstrap();
    await renderApp(locale, "/login");
    await fill("lina.a", "amusant-analyse-anaphore-anarchie-anatomie-anciem");
    await submit();
    expect(await screen.findByText(/anciem/)).toBeInTheDocument();
    expect(calls.some((c) => c.key === "POST /api/auth/login")).toBe(false);
    await submit();
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/login")).toBe(true));
  });

  it("n'interfère pas avec un mot de passe ordinaire", async () => {
    const calls = stubApi({ ...anonymous, "POST /api/auth/login": () => tokenFor(teacher) });
    await session.bootstrap();
    await renderApp(locale, "/login");
    await fill("marie", "Tb9#kLm2-vq8Zr!xW");
    await submit();
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/login")).toBe(true));
  });

  it("connecte puis ouvre l'accueil", async () => {
    const calls = stubApi({ ...anonymous, "POST /api/auth/login": () => tokenFor(teacher) });
    await session.bootstrap();
    await renderApp(locale, "/login");
    await fill("marie", "un mot de passe");
    await submit();
    expect(await screen.findByRole("heading", { level: 1, name: locale === "fr" ? "Mes activités" : "My activities" })).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/auth/login")!.body).toEqual({ username: "marie", password: "un mot de passe" });
  });

  it("annonce les erreurs de l'API sous forme de texte traduit", async () => {
    let n = 0;
    stubApi({
      ...anonymous,
      "POST /api/auth/login": () => [{ status: 401, json: { error: "invalid_credentials" } }, { status: 429, json: { error: "locked", retryAfterSeconds: 90 } }][n++] ?? { status: 500, json: { error: "internal" } },
    });
    await session.bootstrap();
    await renderApp(locale, "/login");
    await fill("marie", "faux");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(x.bad);
    await submit();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(x.locked));
  });

  it("signale un serveur injoignable", async () => {
    vi.stubGlobal("fetch", async (u: string) => { if (u.includes("refresh")) return new Response(JSON.stringify({ error: "invalid_refresh" }), { status: 401 }); throw new TypeError("offline"); });
    await session.bootstrap();
    await renderApp(locale, "/login");
    await fill("marie", "x");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(x.net);
  });
});

describe("connexion rapide par QR code", () => {
  it("lit le fragment, se connecte, puis l'efface de l'adresse", async () => {
    const calls = stubApi({ ...anonymous, "POST /api/auth/login": () => tokenFor(student) });
    await session.bootstrap();
    window.history.replaceState(null, "", "/login#u=lina.a&p=sucre-mutuel-debut-viande-zebre-lampe");
    await renderApp("fr", "/login");
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/login")).toBe(true));
    expect(calls.find((c) => c.key === "POST /api/auth/login")!.body).toEqual({ username: "lina.a", password: "sucre-mutuel-debut-viande-zebre-lampe" });
    expect(window.location.hash).toBe(""); // le secret ne reste pas dans la barre d'adresse
    expect(await screen.findByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
  });
});

describe("inscription d'un enseignant", () => {
  const open = async (locale: "fr" | "en", routes = {}) => {
    const calls = stubApi({ ...anonymous, ...routes });
    await session.bootstrap();
    const r = await renderApp(locale, "/signup");
    return { calls, ...r };
  };

  it("est accessible", async () => {
    const { container } = await open("fr");
    expect(await screen.findByRole("heading", { level: 1, name: "Créer un compte enseignant" })).toBeInTheDocument();
    await noAxeViolations(container);
  });

  it("envoie la langue de l'interface et n'envoie le code d'invitation que s'il est rempli", async () => {
    const { calls } = await open("en", { "POST /api/auth/teachers": () => ({ ...tokenFor(teacher), status: 201 }) });
    await userEvent.type(await screen.findByLabelText("Name shown to students"), "Marie Durand");
    await userEvent.type(screen.getByLabelText("Username"), "marie");
    await userEvent.type(screen.getByLabelText("Password"), "Tb9#kLm2-vq8Zr!xW");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { level: 1, name: "My activities" });
    expect(calls.find((c) => c.key === "POST /api/auth/teachers")!.body).toEqual({ username: "marie", displayName: "Marie Durand", password: "Tb9#kLm2-vq8Zr!xW", locale: "en" });
  });

  it("place l'erreur de mot de passe sur le champ, et celle de l'identifiant sur le sien", async () => {
    let n = 0;
    await open("fr", { "POST /api/auth/teachers": () => (n++ === 0 ? { status: 400, json: { error: "weak_password", reason: "too_short" } } : { status: 409, json: { error: "username_taken" } }) });
    await userEvent.type(await screen.findByLabelText("Nom affiché aux élèves"), "M");
    await userEvent.type(screen.getByLabelText("Identifiant"), "marie");
    await userEvent.type(screen.getByLabelText(/Mot de passe/), "court-mais-12-car");
    await userEvent.click(screen.getByRole("button", { name: "Créer le compte" }));
    const pw = await screen.findByLabelText(/Mot de passe/);
    await waitFor(() => expect(pw).toHaveAttribute("aria-invalid", "true"));
    expect(pw).toHaveAccessibleDescription(/12 caractères au minimum.*au moins 12 caractères/);
    await userEvent.click(screen.getByRole("button", { name: "Créer le compte" }));
    const id = await screen.findByLabelText("Identifiant");
    await waitFor(() => expect(id).toHaveAttribute("aria-invalid", "true"));
    expect(id).toHaveAccessibleDescription("Cet identifiant est déjà pris.");
  });
});

describe("classes", () => {
  it("liste les classes avec les pluriels, et propose d'en créer une quand il n'y en a pas", async () => {
    await loggedIn(teacher, { "GET /api/classes": () => ({ json: [{ id: "k1", name: "4e B", studentCount: 1 }, { id: "k2", name: "3e A", studentCount: 28 }] }) });
    const { container } = await renderApp("fr", "/classes");
    const k1 = await screen.findByRole("article", { name: "4e B" });
    expect(within(k1).getByText("1 élève")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "3e A" })).getByText("28 élèves")).toBeInTheDocument();
    await noAxeViolations(container);
    cleanup();
    await loggedIn(teacher, { "GET /api/classes": () => ({ json: [] }) });
    await renderApp("fr", "/classes");
    expect(await screen.findByRole("heading", { name: "Aucune classe pour l'instant" })).toBeInTheDocument();
  });

  it("crée une classe puis ouvre sa page", async () => {
    const calls = await loggedIn(teacher, {
      "GET /api/classes": () => ({ json: [] }),
      "POST /api/classes": () => ({ status: 201, json: { id: "k9", name: "4e B" } }),
      "GET /api/classes/k9": () => ({ json: { id: "k9", name: "4e B", students: [] } }),
    });
    await renderApp("en", "/classes");
    await userEvent.click((await screen.findAllByRole("button", { name: "New class" }))[0]!);
    await userEvent.type(screen.getByLabelText("Class name"), "4e B");
    await userEvent.click(screen.getByRole("button", { name: "Create class" }));
    expect(await screen.findByRole("heading", { level: 1, name: "4e B" })).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/classes")!.body).toEqual({ name: "4e B" });
    expect(calls.find((c) => c.key === "POST /api/classes")!.headers.get("authorization")).toBe("Bearer tok-t1");
  });

  it("propose de réessayer quand le serveur est injoignable", async () => {
    let up = false;
    vi.stubGlobal("fetch", async (u: string) => {
      if (u.endsWith("/auth/refresh")) return new Response(JSON.stringify({ accessToken: "t", expiresIn: 900, user: teacher }), { status: 200 });
      if (!up) throw new TypeError("offline");
      return new Response("[]", { status: 200 });
    });
    await session.bootstrap();
    await renderApp("fr", "/classes");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Serveur injoignable");
    up = true;
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: "Aucune classe pour l'instant" })).toBeInTheDocument();
  });
});

describe("page d'une classe", () => {
  const created = [
    { id: "s1", username: "lina.a", displayName: "Lina Aubert", passphrase: "sucre-mutuel-debut-viande-zebre-lampe" },
    { id: "s2", username: "hugo.m", displayName: "Hugo Martin", passphrase: "lampe-genou-ocean-tigre" },
  ];
  let roster: { id: string; username: string; displayName: string }[];
  const routes = () => ({
    "GET /api/classes/k1": () => ({ json: { id: "k1", name: "4e B", students: roster } }),
    "POST /api/classes/k1/students": (b: { names: string[] }) => { roster = created.slice(0, b.names.length).map(({ passphrase: _p, ...r }) => r); return { status: 201, json: { students: created.slice(0, b.names.length) } }; },
    "POST /api/classes/k1/students/s1/reset-password": () => ({ json: { id: "s1", username: "lina.a", passphrase: "nouveau-mot-de-passe-test" } }),
    "DELETE /api/classes/k1/students/s2": () => { roster = roster.filter((r) => r.id !== "s2"); return { status: 204 }; },
  });
  beforeEach(() => { roster = []; });

  it("crée des comptes, montre les identifiants UNE fois (avec QR et impression), puis ne les montre plus", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const calls = await loggedIn(teacher, routes());
    const { container } = await renderApp("fr", "/classes/k1");
    await userEvent.type(await screen.findByLabelText("Noms des élèves"), "  Lina Aubert  {Enter}{Enter}Hugo Martin{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Créer les comptes" }));

    const sheet = await screen.findByRole("region", { name: "Identifiants de connexion" });
    expect(calls.find((c) => c.key === "POST /api/classes/k1/students")!.body).toEqual({ names: ["Lina Aubert", "Hugo Martin"] }); // espaces et lignes vides retirés
    expect(within(sheet).getByText("sucre-mutuel-debut-viande-zebre-lampe")).toBeInTheDocument();
    expect(within(sheet).getByText("lampe-genou-ocean-tigre")).toBeInTheDocument();
    expect(within(sheet).getByText("Affichées une seule fois")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getAllByRole("img", { name: /QR code pour se connecter en tant que/ })).toHaveLength(2));
    await userEvent.click(within(sheet).getByRole("button", { name: "Imprimer" }));
    expect(print).toHaveBeenCalledOnce();
    await noAxeViolations(container);

    await userEvent.click(within(sheet).getByRole("button", { name: "Terminé" }));
    expect(screen.queryByRole("region", { name: "Identifiants de connexion" })).toBeNull();
    expect(screen.queryByText("sucre-mutuel-debut-viande-zebre-lampe")).toBeNull(); // plus aucune trace des phrases de passe dans la page
    expect(screen.getByText("Lina Aubert")).toBeInTheDocument(); // l'élève est dans la liste, sans secret
  });

  it("ne met jamais de phrase de passe dans l'adresse du QR hors du fragment", async () => {
    const { quickLoginUrl } = await import("./components/CredentialsSheet");
    const u = new URL(quickLoginUrl("https://toccata.example", created[0]!));
    expect(u.search).toBe(""); // rien dans la requête : le fragment n'est jamais envoyé au serveur
    expect(u.hash).toContain("p=sucre-mutuel-debut-viande-zebre-lampe");
  });

  it("réinitialise une phrase de passe et la montre une fois", async () => {
    roster = created.map(({ passphrase: _p, ...r }) => r);
    await loggedIn(teacher, routes());
    await renderApp("fr", "/classes/k1");
    await userEvent.click(await screen.findByRole("button", { name: "Nouvelle phrase de passe pour Lina Aubert" }));
    const sheet = await screen.findByRole("region", { name: "Identifiants de connexion" });
    expect(within(sheet).getByText("nouveau-mot-de-passe-test")).toBeInTheDocument();
  });

  it("demande confirmation avant de retirer un élève, puis le retire", async () => {
    roster = created.map(({ passphrase: _p, ...r }) => r);
    const calls = await loggedIn(teacher, routes());
    await renderApp("en", "/classes/k1");
    await userEvent.click(await screen.findByRole("button", { name: "Remove Hugo Martin" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove this student?" });
    expect(dialog).toHaveAccessibleDescription("The account and its sessions will be deleted. This cannot be undone.");
    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false); // rien n'est supprimé avant confirmation
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText("Hugo Martin")).toBeNull());
    expect(calls.some((c) => c.key === "DELETE /api/classes/k1/students/s2")).toBe(true);
  });

  it("annuler la suppression ne supprime rien", async () => {
    roster = created.map(({ passphrase: _p, ...r }) => r);
    const calls = await loggedIn(teacher, routes());
    await renderApp("en", "/classes/k1");
    await userEvent.click(await screen.findByRole("button", { name: "Remove Hugo Martin" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Hugo Martin")).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
  });
});
