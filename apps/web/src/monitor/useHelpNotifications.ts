import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

type Permission = NotificationPermission | "unsupported";
const current = (): Permission => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/**
 * Notification du navigateur quand un élève demande de l'aide, tant que l'application est ouverte (même en arrière-plan).
 * La permission se demande sur un geste (jamais au chargement). Les notifications hors application (Web Push) demandent un
 * service d'écoute côté serveur : voir ADR 0014.
 */
export function useHelpNotifications(helpCount: number): { permission: Permission; enable: () => void } {
  const { t } = useLingui();
  const [permission, setPermission] = useState<Permission>(current);
  const seen = useRef(helpCount);
  const title = t`A student asks for help`;
  useEffect(() => {
    if (helpCount > seen.current && permission === "granted") {
      try {
        new Notification(title, { tag: "toccata-help" });
      } catch {
        /* notifications bloquées par le système : le bandeau dans la page suffit */
      }
    }
    seen.current = helpCount;
  }, [helpCount, permission, title]);
  const enable = useCallback(() => {
    if (typeof Notification === "undefined") return;
    void Notification.requestPermission().then((p) => setPermission(p));
  }, []);
  return { permission, enable };
}
