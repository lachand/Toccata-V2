import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineStatus } from "../components/Layout";
import { activateLocale } from "../i18n";
import { dataConfig } from "./config";
import { WorkspaceProvider } from "./provider";
import { probeServer, resetServerProbe } from "./serverInfo";

const reply = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;

beforeEach(async () => {
  dataConfig.probe = false;
  resetServerProbe();
  await activateLocale("fr", false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function show(f: typeof fetch) {
  await act(async () => void (await probeServer(f)));
  render(
    <I18nProvider i18n={i18n}>
      <WorkspaceProvider>
        <OnlineStatus />
      </WorkspaceProvider>
    </I18nProvider>,
  );
}

describe("indicateur de serveur", () => {
  it("cloud joignable : « En ligne »", async () => {
    await show(reply(200, { mode: "cloud", name: "Toccata", upstream: "none", lastSyncAt: null, failing: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent("En ligne");
  });

  it("serveur de classe qui suit le cloud : son nom", async () => {
    await show(reply(200, { mode: "local", name: "Classe 4e B", upstream: "online", lastSyncAt: 1, failing: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent("Classe 4e B");
    expect(screen.getByRole("status")).not.toHaveTextContent("pas d’Internet");
  });

  it("serveur de classe sans Internet : l'élève sait que son travail est gardé là", async () => {
    await show(reply(200, { mode: "local", name: "Classe 4e B", upstream: "offline", lastSyncAt: 1, failing: 2 }));
    expect(screen.getByRole("status")).toHaveTextContent("Classe 4e B · pas d’Internet, tout est gardé ici");
  });

  it("serveur injoignable (Wi-Fi sans Internet, serveur éteint) : hors ligne, même si le navigateur se croit en ligne", async () => {
    expect(navigator.onLine).toBe(true);
    await show((async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    expect(screen.getByRole("status")).toHaveTextContent("Hors ligne, vos modifications sont conservées");
  });

  it("une erreur serveur compte comme injoignable ; un 404 (serveur plus ancien) prouve qu'il répond", async () => {
    await show(reply(502));
    expect(screen.getByRole("status")).toHaveTextContent("Hors ligne");
    cleanup();
    resetServerProbe();
    await show(reply(404));
    expect(screen.getByRole("status")).toHaveTextContent("En ligne");
  });
});
