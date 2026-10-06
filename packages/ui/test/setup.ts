import "@testing-library/jest-dom/vitest";

// jsdom n'implémente pas ces API utilisées par Radix.
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `globals` est désactivé : RTL ne nettoie pas tout seul entre les tests.
afterEach(cleanup);
