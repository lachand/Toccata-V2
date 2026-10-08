# Test de charge

`tools/loadtest.mjs` rejoue le cas d'étude 2 de l'article (une classe de ~40 élèves en 4 groupes) contre une installation réelle :
40 connexions simultanées derrière une même adresse, puis 20 écritures par élève dans la base de son groupe, avec un flux de changements par groupe pour mesurer
la propagation. Il vérifie qu'**aucun document accepté n'est perdu**.

```sh
node tools/loadtest.mjs --base https://toccata.exemple.org --code <code d'invitation> [--students 40 --groups 4 --writes 20 --interval 1000]
```

Résultat de référence (service d'authentification + CouchDB 3.4 sur une même machine de développement, sans proxy ; 40 élèves, 4 groupes, 15 écritures / élève toutes les ~0,8 s, soit ≈ 50 écritures/s) :

| Mesure | p50 | p95 | max |
|---|---|---|---|
| Connexion (40 simultanées, Argon2id) | 766 ms | 778 ms | 782 ms |
| Écriture | 16 ms | 64 ms | 492 ms |
| Propagation vers un pair du groupe | 20 ms | 79 ms | 498 ms |

600 écritures acceptées, 0 refusée, 0 perte. Le test mesure le serveur (CouchDB, droits, jetons) sans la couche RxDB du navigateur ; la réplication RxDB utilise les mêmes requêtes HTTP.
La CI rejoue ce test sur la pile de production. Pour une salle réelle, mesurer aussi le Wi-Fi.
