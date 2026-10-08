# Relecture linguistique fr/en — à faire par des locutrices et locuteurs natifs

Aucune relecture humaine native n'a été faite : les chaînes ont été rédigées (source anglaise, traduction française) par l'équipe de développement et vérifiées **mécaniquement**
(complétude des catalogues, pseudo-locale, axe dans les deux langues). Avant diffusion large, faire relire :

1. **Français** (`apps/web/src/locales/fr/messages.po`) : tutoiement des élèves / vouvoiement des enseignants, vocabulaire du [glossaire](i18n-glossary.md), pluriels, accords.
2. **Anglais** (`apps/web/src/locales/en/messages.po`, source) : naturel, cohérence avec le glossaire.
3. **Parcours à relire en priorité** : connexion et inscription, fiches d'identifiants, séance de l'élève (messages d'aide, attention, retours), suivi, bilan, données personnelles, erreurs.
4. **Documents** : guides enseignant et déploiement (fr/en), modèle de confidentialité (fr uniquement : à adapter au droit local).

Procédure : modifier les `.po`, `pnpm --filter @toccata/web i18n:check`, relancer `pnpm --filter @toccata/e2e e2e` (les tests utilisent les libellés français).
