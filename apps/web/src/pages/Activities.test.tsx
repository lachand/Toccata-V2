import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../auth/session";
import { renderApp, resetSession, student, stubApi, teacher, tokenFor } from "../test-utils";

beforeEach(resetSession);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let n = 0;
/** Identifiant d'activité valide (22 caractères base32) et différent à chaque test : chaque test a sa propre base. */
const nextId = () => `0a0b0c0d0e0f0g0h0j${String(1000 + n++)}`;

async function loggedIn(user: typeof teacher | typeof student, extra: Parameters<typeof stubApi>[0] = {}) {
  const calls = stubApi({
    "POST /api/auth/refresh": () => tokenFor(user),
    "POST /api/auth/logout": () => ({ status: 204 }),
    "GET /api/activities": () => ({ json: [] }),
    ...extra,
  });
  await session.bootstrap();
  return calls;
}
async function noAxeViolations(container: Element) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`)).toEqual([]);
}

describe("Mes activités", () => {
  it("affiche un état vide d'enseignant en français, sans violation d'accessibilité", async () => {
    await loggedIn(teacher);
    const { container } = await renderApp("fr", "/");
    expect(await screen.findByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
    expect(await screen.findByText("Aucune activité ici pour l'instant")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
    await noAxeViolations(container);
  });

  it("affiche un état vide d'élève, sans bouton de création", async () => {
    await loggedIn(student);
    await renderApp("en", "/");
    expect(await screen.findByText("Your teacher will share activities here.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New activity" })).toBeNull();
  });

  it("crée une activité, y ajoute des étapes, les renomme, les masque, les déplace et les supprime", async () => {
    const id = nextId();
    const calls = await loggedIn(teacher, { "POST /api/activities": () => ({ status: 201, json: { id, dbName: `master_${id}` } }) });
    await renderApp("en", "/");
    await userEvent.click(await screen.findByRole("button", { name: "New activity" }));
    await userEvent.type(await screen.findByLabelText("Title"), "Atelier Agile");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Atelier Agile" })).toBeInTheDocument();
    expect(calls.some((c) => c.key === "POST /api/activities")).toBe(true);
    expect(await screen.findByText("No step yet")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add the first step" }));
    const title = await screen.findByLabelText("Step title");
    await userEvent.clear(title);
    await userEvent.type(title, "Brainstorm");
    await userEvent.tab(); // l'enregistrement se fait à la sortie du champ

    await userEvent.click(screen.getByRole("button", { name: "Add a step" }));
    const second = await screen.findByLabelText("Step title");
    await waitFor(() => expect(second).toHaveValue("New step"));
    await userEvent.clear(second);
    await userEvent.type(second, "Retro");
    await userEvent.tab();

    const labels = () => within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d+/, "").trim());
    await waitFor(() => expect(labels().slice(0, 2)).toEqual(["Brainstorm", "Retro"]));

    await userEvent.click(screen.getByRole("button", { name: "Move earlier" }));
    await waitFor(() => expect(labels().slice(0, 2)).toEqual(["Retro", "Brainstorm"]));

    await userEvent.click(screen.getByRole("switch", { name: "Visible to students" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Show “Retro” to students" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Delete step" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(labels().slice(0, 1)).toEqual(["Brainstorm"]));

    await userEvent.click(screen.getByRole("link", { name: "Back to activities" }));
    const card = await screen.findByRole("article", { name: "Atelier Agile" });
    expect(within(card).getByText("1 step")).toBeInTheDocument();
  });

  it("change de langue à chaud", async () => {
    await loggedIn(teacher);
    await renderApp("fr", "/");
    await userEvent.click(await screen.findByRole("radio", { name: "English" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "My activities" })).toBeInTheDocument());
    expect(localStorage.getItem("toccata.locale")).toBe("en");
  });

  it("signale la perte de connexion", async () => {
    await loggedIn(teacher);
    await renderApp("en", "/");
    await screen.findByRole("heading", { level: 1, name: "My activities" });
    expect(screen.getByRole("status")).toHaveTextContent("Online");
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Offline, your changes are kept"));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("la pseudo-locale change tous les textes d'interface", async () => {
    await loggedIn(teacher);
    await renderApp("pseudo" as never, "/");
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1.textContent).not.toBe("My activities");
    expect(h1.textContent).toMatch(/[^\x00-\x7F]/);
  });
});
