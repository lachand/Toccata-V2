# ADR 0007 — Internationalisation et localisation

**Statut** : accepté (la bibliothèque est confirmée par le spike de la Phase 1)

## Décision
- **Français et anglais** complets dès la première version ; ajouter une langue ne doit pas
  demander de modifier le code.
- Bibliothèque envisagée : **Lingui** (messages ICU, extraction automatique, catalogues `.po`).
  Repli : react-i18next.
- Aucun texte visible en dur. Dates, nombres, durées, listes, pluriels et tris passent par
  `Intl` ; jamais de phrase assemblée par concaténation.
- Langue : préférence du profil > `navigator.languages` > français. `<html lang>` suit la
  langue active. Les catalogues fr et en sont précachés (usage hors ligne).
- **Interface traduite, contenu non traduit** : ce que les enseignants saisissent est de la
  donnée. Un modèle porte un champ `locale`.
- **URLs non localisées** (`/activities`, `/session/...`).
- Serveur : codes d'erreur uniquement, traduits par le client. Journal de recherche : codes
  d'action neutres (jamais de texte localisé).
- CSS en propriétés **logiques** (`margin-inline`, `padding-block`) pour permettre l'ajout
  d'écritures de droite à gauche ; aucune largeur fixe de libellé (le français est ≈ 30 %
  plus long que l'anglais).
- Qualité : CI qui échoue sur toute clé manquante en fr/en, **pseudo-locale** pour repérer
  débordements et chaînes oubliées, tests Playwright et axe dans les deux langues.

Vocabulaire : [`../i18n-glossary.md`](../i18n-glossary.md).
