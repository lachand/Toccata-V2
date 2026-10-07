import { createRegistry } from "@toccata/apps-sdk";
import { externalApp } from "./external";

/** Applications disponibles dans l'assistant d'ajout. L'ordre est celui de l'affichage. */
export const registry = createRegistry();
registry.register(externalApp);
