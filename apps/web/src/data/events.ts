import { newId, type EventAction } from "@toccata/schema";
import type { Workspace } from "./workspace";

type Meta = Record<string, string | number | boolean>;

/**
 * Journal de séance : une ligne par geste, avec un code d'action neutre (jamais de texte), l'objet concerné (identifiant) et
 * quelques valeurs scalaires. Aucun nom, aucun contenu d'élève. Écrit dans la base de l'instance, en ajout seul (règle CouchDB).
 * Ne lève jamais : tenir un journal ne doit jamais empêcher de travailler.
 */
export async function logEvent(ws: Workspace, instanceId: string, actorId: string, action: EventAction, extra: { object?: string; meta?: Meta; initiatedBy?: "user" | "system"; teacher?: boolean } = {}): Promise<void> {
  try {
    const col = await ws.instanceCol(instanceId);
    const t = ws.serverNow();
    await col.insert({
      id: newId(t),
      kind: "event",
      authorId: actorId,
      instanceId,
      action,
      ...(extra.object ? { object: extra.object.slice(0, 100) } : {}),
      ...(extra.meta ? { meta: extra.meta } : {}),
      initiatedBy: extra.initiatedBy ?? "user",
      ...(extra.teacher ? { teacherOnly: true } : {}),
      createdAt: t,
      updatedAt: t,
    });
  } catch {
    /* journal indisponible : sans conséquence pour la séance */
  }
}
