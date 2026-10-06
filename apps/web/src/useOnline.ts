import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Connexion du navigateur (indicative : la vraie synchro sera pilotée par la couche données, Phase 2). */
export const useOnline = (): boolean => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
