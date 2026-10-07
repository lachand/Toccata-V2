import { createRegistry } from "@toccata/apps-sdk";
import { externalApp } from "./external";
import { formApp } from "./form";
import { kanbanApp } from "./kanban";
import { textApp } from "./text";
import { timerApp } from "./timer";

/** Applications disponibles dans l'assistant d'ajout. L'ordre est celui de l'affichage. */
export const registry = createRegistry();
registry.register(timerApp);
registry.register(kanbanApp);
registry.register(textApp);
registry.register(formApp);
registry.register(externalApp);
