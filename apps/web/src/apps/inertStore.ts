import type { InstanceStore } from "@toccata/apps-sdk";

/** Magasin sans données : pour afficher une application sans instance (remplacé par l'instance d'aperçu). */
export const inertStore = (viewer: InstanceStore["viewer"]): InstanceStore => ({
  viewer,
  serverNow: Date.now,
  watch: (_k, _id, cb) => (cb([]), () => undefined),
  put: async () => "",
  remove: async () => undefined,
});
