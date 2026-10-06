# ADR 0007 — Internationalisation et localisation

**Statut** : accepté (la bibliothèque est confirmée par le spike de la Phase 1)

## Décision
- **Français et anglais** complets dès la première version ; ajouter une langue ne doit pas
  demander de modifier le code.
- Bibliothèque : **Lingui 6** (messages ICU, extraction automatique, catalogues `.po`),
  confirmée par le spike de la Phase 1. Repli : react-i18next.
- **Langue source : l'anglais** (les traducteurs partent presque toujours de l'anglais) ;
  le français est une traduction complète. Les messages portent des variables nommées
  (`const when = …` puis `{when}`) pour que les traducteurs ne voient pas `{0}`.
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
- Qualité, effectivement en place :
  - `pnpm i18n:check` (lancé par `pnpm build` donc par la CI) extrait les messages puis
    **échoue** sur toute traduction manquante, « fuzzy », ou dont les variables et balises
    diffèrent de la source. `lingui compile --strict` seul ne suffit pas : avec une langue de
    repli, un message vide passe.
  - **Pseudo-locale** (Lingui accentue chaque lettre, sans allonger le texte) : sert à repérer
    les chaînes non extraites. Les débordements dus à la longueur seront testés en comparant
    fr et en dans Playwright.
  - Tests unitaires et de composants dans les deux langues ; axe et Playwright à venir.

Vocabulaire : [`../i18n-glossary.md`](../i18n-glossary.md).
