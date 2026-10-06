import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { renderIn } from "../test-utils";
import { Gallery } from "./Gallery";

afterEach(cleanup);

for (const [locale, title, hide, show] of [
  ["fr", "Composants", "Masquer l'étape Estimer", "Afficher l'étape Bonus"],
  ["en", "Components", "Hide step Estimate", "Show step Bonus"],
] as const) {
  describe(`Galerie (${locale})`, () => {
    it("traduit les noms accessibles passés aux composants", async () => {
      await renderIn(locale, (l) => <Gallery locale={l} />);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: hide })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: show })).toBeInTheDocument();
    });

    it("n'a pas de violation d'accessibilité (axe)", async () => {
      const { container } = await renderIn(locale, (l) => <Gallery locale={l} />);
      const res = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
      expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });

    it("ouvre un dialogue traduit et rend le focus", async () => {
      await renderIn(locale, (l) => <Gallery locale={l} />);
      const opener = screen.getAllByRole("button").find((b) => /resource|ressource/i.test(b.textContent ?? "") && b.className.includes("tc-btn"))!;
      await userEvent.click(opener);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
}
