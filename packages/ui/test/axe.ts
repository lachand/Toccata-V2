import axe from "axe-core";
import { expect } from "vitest";

/** Échoue si axe trouve une violation. Le contraste est exclu : jsdom n'a pas de mise en page ; il est vérifié sur les jetons (`pnpm contrast`). */
export async function expectNoA11yViolations(container: Element) {
  const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  const msg = res.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n");
  expect(res.violations, msg).toEqual([]);
}
