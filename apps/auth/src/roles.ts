export type Membership = { activityId: string; instanceId: string };

/**
 * Rôles CouchDB d'un compte, calculés à chaque émission de jeton.
 *  - enseignant : `owner:<id>` (un seul, quel que soit le nombre d'activités) ;
 *  - élève : `inst:<instance>:member` et `master:<activité>:read` pour ses seules instances.
 */
export function rolesFor(user: { id: string; role: "teacher" | "student"; memberships?: readonly Membership[] }): string[] {
  if (user.role === "teacher") return [`owner:${user.id}`];
  const roles = new Set<string>();
  for (const m of user.memberships ?? []) {
    roles.add(`inst:${m.instanceId}:member`);
    roles.add(`master:${m.activityId}:read`);
  }
  return [...roles].sort();
}
