# ADR 0005 — Applications externes (iframe)

**Statut** : accepté (spike e)

## Constat
Beaucoup de sites interdisent l'intégration (`X-Frame-Options`, `frame-ancestors`). Mesure du
`pnpm --filter @toccata/spikes iframe-check` le jour du spike : Framapad, Framacalc,
Wikipédia, GeoGebra, Wordwall, Padlet et YouTube **nocookie/embed** sont intégrables ;
**Vikidia** (utilisé dans l'étude CS3 de l'article), YouTube « watch », Google Docs, Scratch
et Canva sont **bloqués**.

## Décision
Chaque ressource/app externe a un mode d'affichage :
1. `iframe` (sandbox, `https:` uniquement, `referrerpolicy`), par défaut si l'intégration est possible ;
2. `fenêtre liée` : onglet/fenêtre ouvert à côté, suivi par Toccata (retour via l'état
   participant) quand l'intégration est refusée ;
3. `lien` en dernier recours.

Le service d'auth expose une vérification côté serveur (`GET /embed-check?url=`, protégée
contre le SSRF) pour prévenir l'enseignant à la création. Les en-têtes des sites changent :
le résultat est indicatif, pas figé.
