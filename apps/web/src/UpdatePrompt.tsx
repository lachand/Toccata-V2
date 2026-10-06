import { useLingui } from "@lingui/react/macro";
import { Button } from "@toccata/ui";
import { useRegisterSW } from "virtual:pwa-register/react";

/** Propose de recharger quand une nouvelle version est prête (mise à jour contrôlée : jamais de rechargement en pleine séance). */
export function UpdatePrompt() {
  const { t } = useLingui();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="tc-card tc-root" style={{ position: "fixed", insetInlineEnd: "var(--space-4)", insetBlockEnd: "var(--space-4)", display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap", maxInlineSize: "min(90vw, 420px)", boxShadow: "var(--shadow-2)" }}>
      <span>{needRefresh ? t`A new version is available.` : t`Ready to work offline.`}</span>
      {needRefresh ? <Button variant="primary" onClick={() => void updateServiceWorker(true)}>{t`Reload`}</Button> : null}
      <Button variant="ghost" onClick={() => (needRefresh ? setNeedRefresh(false) : setOfflineReady(false))}>{t`Dismiss`}</Button>
    </div>
  );
}
