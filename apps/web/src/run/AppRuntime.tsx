import { useLingui } from "@lingui/react/macro";
import type { AppModule, AppType, InstanceStore } from "@toccata/apps-sdk";
import type { AppDoc } from "@toccata/schema";
import { registry } from "../apps/registry";

export function AppRuntime({ app, store }: { app: AppDoc; store: InstanceStore }) {
  const { t } = useLingui();
  const m = registry.get(app.type as AppType) as AppModule<AppType> | undefined;
  if (!m) return <p style={{ margin: 0, color: "var(--muted)" }}>{t`This type of app is not available in this version.`}</p>;
  const R = m.Runtime as React.ComponentType<{ app: AppDoc; store: InstanceStore }>;
  return <R app={app} store={store} />;
}
