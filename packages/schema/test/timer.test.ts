import { describe, expect, it } from "vitest";
import { estimateClockOffset, timerRemainingMs, timerTone } from "../src";

describe("chronomètre", () => {
  const running = { status: "running" as const, remainingMs: 180_000, startedAtMs: 1_000_000 };
  it("décompte à partir de l'heure serveur de démarrage", () => {
    expect(timerRemainingMs(running, 1_000_000)).toBe(180_000);
    expect(timerRemainingMs(running, 1_060_000)).toBe(120_000);
    expect(timerRemainingMs(running, 1_500_000)).toBe(0);
  });
  it("ne varie pas en pause ni à l'arrêt", () => {
    expect(timerRemainingMs({ ...running, status: "paused" }, 9_999_999)).toBe(180_000);
    expect(timerRemainingMs({ status: "idle", remainingMs: 5, startedAtMs: null }, 9_999_999)).toBe(5);
  });
  it("ne remonte jamais si l'horloge locale est en retard sur le démarrage", () => {
    expect(timerRemainingMs(running, 900_000)).toBe(180_000);
  });
  it("donne la couleur de l'écran de suivi", () => {
    expect(timerTone(10 * 60_000)).toBe("ok");
    expect(timerTone(300_000)).toBe("ok");
    expect(timerTone(299_999)).toBe("amber");
    expect(timerTone(120_000)).toBe("amber");
    expect(timerTone(119_999)).toBe("red");
    expect(timerTone(0)).toBe("red");
  });
  it("corrige l'écart d'horloge : deux appareils décalés affichent le même temps", () => {
    // appareil A en avance de 40 s, appareil B en retard de 25 s, serveur = vérité
    const server = 5_000_000;
    const a = estimateClockOffset([{ sentAtMs: server + 40_000 - 100, receivedAtMs: server + 40_000 + 100, serverMs: server }])!;
    const b = estimateClockOffset([{ sentAtMs: server - 25_000 - 100, receivedAtMs: server - 25_000 + 100, serverMs: server }])!;
    const now = server + 30_000; // heure serveur réelle
    const remA = timerRemainingMs({ status: "running", remainingMs: 100_000, startedAtMs: server }, now + 40_000 + a);
    const remB = timerRemainingMs({ status: "running", remainingMs: 100_000, startedAtMs: server }, now - 25_000 + b);
    expect(remA).toBe(70_000);
    expect(remB).toBe(70_000);
  });
  it("garde l'échantillon au plus court aller-retour", () => {
    const off = estimateClockOffset([
      { sentAtMs: 0, receivedAtMs: 2000, serverMs: 5000 }, // RTT 2 s : offset 4000
      { sentAtMs: 10, receivedAtMs: 30, serverMs: 5020 }, // RTT 20 ms : offset 5000
    ]);
    expect(off).toBe(5000);
  });
  it("renvoie null sans échantillon exploitable", () => {
    expect(estimateClockOffset([])).toBeNull();
    expect(estimateClockOffset([{ sentAtMs: 10, receivedAtMs: 5, serverMs: 1 }])).toBeNull();
  });
});
