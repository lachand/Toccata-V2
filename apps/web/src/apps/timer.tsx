import { useLingui } from "@lingui/react/macro";
import type { AppModule, RuntimeDoc } from "@toccata/apps-sdk";
import { timerRemainingMs } from "@toccata/schema";
import { Button, Field, TextInput, TimerChip } from "@toccata/ui";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useState } from "react";

type State = RuntimeDoc<"timerstate">;

/** Le chronomètre est un état partagé : tous voient la même valeur, calculée avec l'heure SERVEUR (pas l'horloge de l'appareil). */
export const timerApp: AppModule<"timer"> = {
  type: "timer",
  useLabels() {
    const { t } = useLingui();
    return { typeName: t`Timer`, description: t`A countdown shared by everyone, green then orange then red as time runs out.`, defaultName: t`Timer` };
  },
  Icon: Timer,
  defaultConfig: () => ({ durationSec: 300 }),
  Editor({ app, onChange }) {
    const { t } = useLingui();
    const [minutes, setMinutes] = useState(Math.floor(app.config.durationSec / 60));
    const [seconds, setSeconds] = useState(app.config.durationSec % 60);
    const emit = (m: number, s: number) => onChange({ durationSec: Math.min(86_400, Math.max(1, m * 60 + s)) });
    return (
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Field label={t`Minutes`}>
          <TextInput type="number" min={0} max={1440} inputMode="numeric" value={minutes} onChange={(e) => (setMinutes(Math.max(0, Math.round(Number(e.currentTarget.value) || 0))), emit(Math.max(0, Math.round(Number(e.currentTarget.value) || 0)), seconds))} />
        </Field>
        <Field label={t`Seconds`}>
          <TextInput type="number" min={0} max={59} inputMode="numeric" value={seconds} onChange={(e) => (setSeconds(Math.min(59, Math.max(0, Math.round(Number(e.currentTarget.value) || 0)))), emit(minutes, Math.min(59, Math.max(0, Math.round(Number(e.currentTarget.value) || 0)))))} />
        </Field>
      </div>
    );
  },
  Runtime({ app, store }) {
    const { t } = useLingui();
    const [state, setState] = useState<State | null>(null);
    const [now, setNow] = useState(() => store.serverNow());
    useEffect(
      () =>
        store.watch("timerstate", app.id, (docs) => {
          // plusieurs documents seulement si deux appareils ont créé l'état en même temps : le plus récent fait foi
          setState([...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null);
        }),
      [store, app.id],
    );
    const running = state?.status === "running";
    useEffect(() => {
      if (!running) return;
      const h = setInterval(() => setNow(store.serverNow()), 250);
      return () => clearInterval(h);
    }, [running, store]);

    const full = app.config.durationSec * 1000;
    const base = { remainingMs: full, status: "idle" as const, startedAtMs: null };
    const current = state ?? base;
    const remaining = timerRemainingMs(current, running ? now : store.serverNow());
    const finished = remaining === 0 && current.status !== "idle";

    const write = (status: State["status"], remainingMs: number, startedAtMs: number | null) =>
      store.put({ kind: "timerstate", appId: app.id, status, remainingMs, startedAtMs, ...(state ? { id: state.id } : {}) });
    const start = () => write("running", remaining > 0 ? remaining : full, store.serverNow());
    const pause = () => write("paused", timerRemainingMs(current, store.serverNow()), null);
    const reset = () => write("idle", full, null);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <TimerChip remainingMs={remaining} label={app.name} />
        {running ? (
          <Button icon={<Pause size={16} />} onClick={() => void pause()}>{t`Pause`}</Button>
        ) : (
          <Button variant="primary" icon={<Play size={16} />} onClick={() => void start()}>{current.status === "paused" ? t`Resume` : t`Start`}</Button>
        )}
        <Button icon={<RotateCcw size={16} />} onClick={() => void reset()}>{t`Reset`}</Button>
        <span role="status" style={{ color: "var(--muted)" }}>{finished ? t`Time is up.` : ""}</span>
      </div>
    );
  },
};
