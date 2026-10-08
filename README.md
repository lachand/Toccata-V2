# Toccata 2

Plateforme web d'**orchestration de classe** fondée sur l'*Activity Based Computing* :
un enseignant scripte une activité (étapes, ressources, applications), la distribue
(classe, groupes, individus), la pilote en direct et la reprend d'une séance à l'autre,
y compris **sans réseau**.

Réécriture moderne du projet de recherche
[Toccata](https://github.com/lachand/Toccata), décrit dans :

> V. Lachand, C. Michel, A. Tabard. *Toccata: Supporting Classroom Orchestration with
> Activity Based Computing.* Proc. ACM IMWUT 3(2), 2019.
> [doi:10.1145/3328924](https://doi.org/10.1145/3328924) · [HAL](https://hal.science/hal-02136481)

## Statut

Phase 0 — cadrage. Rien n'est encore exécutable. Voir [`docs/roadmap.md`](docs/roadmap.md).

## Pile

React 19 · Vite · TypeScript · RxDB + CouchDB · Tailwind/shadcn · TipTap + Yjs · PWA.
Détails et décisions : [`docs/adr/`](docs/adr).

## Structure

```
apps/web           PWA React
apps/auth          service d'authentification / provisioning
apps/local-server  serveur de classe (Raspberry Pi, mini-PC) : CouchDB + authentification locale + HTTPS (voir docs/guide-serveur-local.md)
packages/schema    types, schémas, résolution master/instance
packages/apps-sdk  contrat des applications embarquées
packages/ui        design system
infra/             docker-compose, config CouchDB
e2e/               scénarios Playwright (études de cas de l'article)
```

## Licence

[MIT](LICENSE)
