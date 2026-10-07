import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "../auth/session";
import { renderApp, resetSession, stubApi, teacher, tokenFor } from "../test-utils";

beforeEach(resetSession);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let n = 0;
const nextId = () => `0b0c0d0e0f0g0h0j0k${String(2000 + n++)}`;

async function openEditor() {
  const id = nextId();
  stubApi({
    "POST /api/auth/refresh": () => tokenFor(teacher),
    "POST /api/auth/logout": () => ({ status: 204 }),
    "GET /api/activities": () => ({ json: [] }),
    "POST /api/activities": () => ({ status: 201, json: { id, dbName: `master_${id}` } }),
  });
  await session.bootstrap();
  await renderApp("en", "/");
  await userEvent.click(await screen.findByRole("button", { name: "New activity" }));
  await userEvent.type(await screen.findByLabelText("Title"), "Atelier");
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
  await screen.findByRole("heading", { level: 1, name: "Atelier" });
  return within(screen.getByRole("region", { name: "Resources and apps for the whole activity" }));
}

describe("Ressources et applications", () => {
  it("ajoute un lien (https seulement), l'aperçoit, le renomme et le supprime", async () => {
    const panel = await openEditor();
    await userEvent.click(panel.getByRole("button", { name: "Add" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: /Web link/ }));
    await userEvent.type(dialog.getByLabelText("Address"), "http://example.org/");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    expect(await dialog.findByText("Enter an address starting with https://")).toBeInTheDocument();

    const field = dialog.getByLabelText("Address");
    await userEvent.clear(field);
    await userEvent.type(field, "https://fr.wikipedia.org/wiki/Accueil");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));

    const name = await panel.findByDisplayValue("fr.wikipedia.org");
    await userEvent.click(panel.getByRole("button", { name: "Show fr.wikipedia.org" }));
    const frame = await panel.findByTitle("fr.wikipedia.org");
    expect(frame).toHaveAttribute("sandbox");
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-top-navigation/);
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame).toHaveAttribute("src", "https://fr.wikipedia.org/wiki/Accueil");

    await userEvent.clear(name);
    await userEvent.type(name, "Encyclopédie");
    await userEvent.tab();
    await panel.findByRole("button", { name: "Hide Encyclopédie" });

    await userEvent.click(panel.getByRole("button", { name: "Delete Encyclopédie" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(panel.getByText("Nothing here yet.")).toBeInTheDocument());
  });

  it("n'intègre jamais notre propre origine dans un cadre", async () => {
    const panel = await openEditor();
    await userEvent.click(panel.getByRole("button", { name: "Add" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: /Web link/ }));
    await userEvent.type(dialog.getByLabelText("Address"), `https://localhost:3000/secret`);
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await userEvent.click(await panel.findByRole("button", { name: /^Show / }));
    expect(document.querySelector("iframe")).toBeNull();
    expect(panel.getByRole("link", { name: /Open in a new tab/ })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("ajoute une application web configurée dans l'assistant", async () => {
    const panel = await openEditor();
    await userEvent.click(panel.getByRole("button", { name: "Add" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: /Web app/ }));
    const addr = dialog.getByLabelText("Address");
    await userEvent.clear(addr);
    await userEvent.type(addr, "https://framacalc.org/abc{Enter}");
    await panel.findByDisplayValue("Web app");
    await userEvent.click(panel.getByRole("button", { name: "Show Web app" }));
    expect(await panel.findByTitle("Web app")).toHaveAttribute("src", "https://framacalc.org/abc");
  });
});
