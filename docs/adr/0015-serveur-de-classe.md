# ADR 0015 — Serveur de classe (Phase 6)

Statut : accepté. Réponse à D2 (mobilité) et D3 (résilience réseau) de l'article, cas d'étude 1 (sorties, réseau instable).

## Contraintes qui ont fixé l'architecture

1. **Un service worker exige HTTPS** (ou `localhost`). Un serveur de classe en `http://nom.local` n'aurait ni coque hors ligne ni
   installation. → Caddy avec un certificat valide (fichiers fournis, ou autorité locale `tls internal` à installer sur les appareils).
2. **Contenu mixte** : une page `https://cloud` ne peut pas appeler `http://serveur-de-classe`. Et une origine = un stockage local.
   → **le navigateur ne parle qu'à l'origine qui l'a servi** (`/api`, `/couch`). En classe, tout le monde ouvre le serveur de classe ;
   c'est **le serveur de classe qui se synchronise avec le cloud**, par réplication CouchDB. Le spike (d) (bascule d'endpoint côté
   appareil) n'est donc pas repris ; il n'y a aucune logique de choix d'endpoint dans l'interface.
3. **L'authentification doit fonctionner sans Internet** → le service `apps/auth` tourne sur le serveur de classe (`SERVER_MODE=local`),
   avec **sa propre clé JWT** : un serveur de classe volé ne peut pas forger de jetons valables sur le cloud.

## Mécanisme

- `Reconciler` (apps/auth/src/replication.ts), joué des deux côtés toutes les `RECONCILE_SECONDS` : (1) **provisionne** (bases, `_security`,
  règles d'écriture) tout ce que le registre connaît — `_security` ne se réplique pas, et un serveur découvre les activités par la
  réplication des comptes ; (2) en mode local, maintient des **documents `_replicator`** continus dans les deux sens (`toccata-<base>-up|down`,
  `create_target`) pour la base de comptes et pour chaque base d'activité, de groupe et d'enseignant ; (3) mesure l'état.
- **Périmètre** : `TEACHER_IDS`. La base de comptes ne copie que les types `user|class|activity|instance|uname` dont le propriétaire est
  servi (sélecteur de réplication) ; **jamais les sessions** (jetons de rafraîchissement). Les autres enseignants restent sur le cloud
  (testé).
- **Registre sans tableau partagé** : les instances d'une activité se déduisent des documents `instance` (`activityId`), au lieu d'un tableau
  que les deux côtés modifieraient. `ownerId` sert au filtrage.
- **État** : `GET /api/server-info` (public, sans secret) : mode, nom, état de l'amont (`online|offline|unknown|none`), dernière
  synchronisation, réplications en panne. L'interface sonde ce point (15 s) : c'est un état **réel**, là où `navigator.onLine` dit « en ligne »
  sur un Wi-Fi sans Internet. Indicateur : « <nom> » / « <nom> · pas d'Internet, tout est gardé ici » / hors ligne.
- **Reprise** : le réplicateur CouchDB reprend seul ; côté navigateur, la réplication RxDB réessaie toutes les 5 s et est relancée dès que la
  sonde repasse au vert. Un 404 sur `_changes` (base pas encore créée par la réplication descendante) est traité comme une panne passagère.

## Ce qui est vérifié

- **Intégration à deux CouchDB réels** (5984 « cloud », 5985 « classe ») avec un proxy coupable : comptes répliqués (un élève du cloud se connecte
  en classe), contenu dans les deux sens, droits identiques, autre enseignant absent, **coupure** détectée puis **rétablissement** sans perte.
- **E2E CS1 complet** (navigateurs, deux origines) : préparation sur le cloud, élève sur le serveur de classe, coupure d'Internet (indicateur,
  travail conservé), rétablissement (l'enseignant, sur le cloud, retrouve les cartes), puis coupure du réseau de l'appareil lui-même.
- **Pile réelle** (Caddy + service local + CouchDB, image construite) : interface servie, service worker actif, politique de sécurité sans
  violation (la fumée a trouvé une règle `font-src` trop stricte), `/couch` refuse sans jeton, comptes en lecture seule.

## Limites connues

- **Comptes en lecture seule en classe** (`503 local_readonly`) : créer une classe, un élève, réinitialiser une phrase de passe se fait sur le cloud
  avant la séance (l'unicité des identifiants et l'unique propriétaire des mots de passe l'exigent).
- Une inscription (membres d'un groupe) modifiée **des deux côtés en même temps** suit « dernier écrit gagne ».
- Les **hachés Argon2id** des comptes servis sont sur le serveur de classe : chiffrer le disque, limiter le périmètre à un enseignant.
- **Horloge** : un Raspberry Pi sans horloge matérielle démarre hors ligne avec une heure fausse. Les chronomètres restent cohérents entre élèves
  (heure du serveur de classe) mais la validité des jetons et les dates en pâtissent : prévoir un module RTC et `chrony`.
- **Non testés ici** (pas de matériel) : point d'accès Wi-Fi (`hotspot/setup-hotspot.sh`), certificat réel, partage de connexion 4G.
- Pas de Web Push (voir ADR 0014).
