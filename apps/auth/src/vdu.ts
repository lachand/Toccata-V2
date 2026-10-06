import { idSchema } from "@toccata/schema";

/**
 * `validate_doc_update` générés à l'approvisionnement, avec la liste des enseignants propriétaires intégrée.
 * Un enseignant porte UN rôle `owner:<id>` (et non un rôle par instance : 1 000 rôles feraient un jeton de 30 Ko).
 * Les identifiants sont validés avant d'être insérés dans le code : aucun risque d'injection.
 */
function ownersLiteral(ownerIds: readonly string[]): string {
  if (ownerIds.length === 0) throw new RangeError("au moins un propriétaire");
  for (const id of ownerIds) if (!idSchema.safeParse(id).success) throw new RangeError("identifiant de propriétaire invalide");
  return JSON.stringify(ownerIds.map((id) => `owner:${id}`));
}

const OWNER_CHECK = `
  var OWNER_ROLES = __OWNERS__;
  function isOwner(roles) { for (var i = 0; i < OWNER_ROLES.length; i++) if (roles.indexOf(OWNER_ROLES[i]) !== -1) return true; return false; }`;

/** Base `master_<id>` : contenu de l'activité, écrit par les propriétaires seulement. */
export function masterValidator(ownerIds: readonly string[]): string {
  return `function (newDoc, oldDoc, userCtx, secObj) {${OWNER_CHECK.replace("__OWNERS__", ownersLiteral(ownerIds))}
  if (userCtx.roles.indexOf('_admin') !== -1) return;
  if (!isOwner(userCtx.roles)) throw ({ forbidden: 'read_only' });
}`;
}

/** Base `inst_<id>` : les membres n'écrivent que leurs propres documents ; les propriétaires tout. */
export function instanceValidator(instanceId: string, ownerIds: readonly string[]): string {
  if (!idSchema.safeParse(instanceId).success) throw new RangeError("identifiant d'instance invalide");
  return `function (newDoc, oldDoc, userCtx, secObj) {${OWNER_CHECK.replace("__OWNERS__", ownersLiteral(ownerIds))}
  if (userCtx.roles.indexOf('_admin') !== -1) return;
  if (isOwner(userCtx.roles)) return;
  if (userCtx.roles.indexOf('inst:${instanceId}:member') === -1) throw ({ forbidden: 'access_denied' });
  var target = newDoc._deleted ? oldDoc : newDoc;
  if ((target && target.teacherOnly === true) || (oldDoc && oldDoc.teacherOnly === true)) throw ({ forbidden: 'teacher_only' });
  if (!newDoc._deleted) {
    if (!oldDoc && newDoc.authorId !== userCtx.name) throw ({ forbidden: 'author_mismatch' });
    if (oldDoc && oldDoc.authorId !== undefined && newDoc.authorId !== oldDoc.authorId) throw ({ forbidden: 'author_immutable' });
  }
}`;
}
