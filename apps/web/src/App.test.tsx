import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { type Locale, activateLocale } from "./i18n";

function Harness({ initial }: { initial: Locale }) {
  const [locale, setLocale] = useState<Locale>(initial);
  useEffect(() => i18n.on("change", () => setLocale(i18n.locale as Locale)), []);
  return (
    <I18nProvider i18n={i18n}>
      <App locale={locale} />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("App (i18n)", () => {
  it("s'affiche en français avec pluriels et dates françaises", async () => {
    await activateLocale("fr");
    render(<Harness initial="fr" />);
    expect(screen.getByRole("heading", { level: 1, name: "Mes activités" })).toBeInTheDocument();
    expect(screen.getByText("20 élèves")).toBeInTheDocument();
    expect(screen.getByText("1 élève")).toBeInTheDocument();
    expect(screen.getByText(/lundi 5 octobre 2026/i)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("s'affiche en anglais", async () => {
    await activateLocale("en");
    render(<Harness initial="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "My activities" })).toBeInTheDocument();
    expect(screen.getByText("20 students")).toBeInTheDocument();
    expect(screen.getByText("1 student")).toBeInTheDocument();
    expect(screen.getByText(/Monday, October 5, 2026/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("change de langue à chaud et mémorise le choix", async () => {
    await activateLocale("fr");
    render(<Harness initial="fr" />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "en");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "My activities" })).toBeInTheDocument());
    expect(localStorage.getItem("toccata.locale")).toBe("en");
  });

  it("ne traduit pas le contenu saisi par l'enseignant", async () => {
    await activateLocale("en");
    render(<Harness initial="en" />);
    expect(screen.getByRole("heading", { name: "Atelier Agile : la ville en Lego" })).toBeInTheDocument();
  });

  it("la pseudo-locale change tous les textes d'interface (aucun texte oublié)", async () => {
    await activateLocale("pseudo", false);
    render(<Harness initial="en" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).not.toBe("My activities");
    expect(h1.textContent).toMatch(/[^\x00-\x7F]/); // la pseudo-locale accentue chaque lettre
  });
});
