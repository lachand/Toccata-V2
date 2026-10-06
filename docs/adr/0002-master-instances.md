# ADR 0002 — Instances = surcouche du master

**Statut** : accepté

Une instance d'activité référence son master et ne stocke que des **surcharges**
(`overrides`). Le contenu affiché est `resolve(master, overrides)`, fonction pure.

- Modification du master → visible dans toutes les instances liées.
- Modification dans une instance → confinée à celle-ci.
- Une instance peut être déliée du master.

**Raison** : l'ancienne implémentation clonait tous les documents (`_duplicate_<guid>`) et
la propagation master → copies était cassée. Une surcouche supprime la divergence.

## Mise en œuvre (Phase 1)
Implémentée et testée dans `packages/schema` ; détails, formes exactes des surcharges,
déliaison par instantané et propriétés vérifiées dans [`../data-model.md`](../data-model.md).
