# Guide de déploiement de Toccata

Ce guide s'adresse à la personne qui **installe et administre** Toccata (informaticien·ne d'établissement, enseignant·e à l'aise avec un terminal).
Deux installations existent, avec **le même paquet** (`deploy/`) :

| | Cloud | Serveur de classe |
|---|---|---|
| Rôle | Serveur de référence, accessible depuis Internet | Copie locale (Raspberry Pi, mini-PC) qui fonctionne **sans Internet** pendant la séance |
| Où | Un VPS / une VM | Dans la salle |
| Certificat | Let's Encrypt, automatique | Autorité locale de Caddy ou certificat fourni |
| Comptes | Créés ici (inscription sur code d'invitation) | Copiés depuis le cloud, **en lecture seule** |

## 1. Cloud sur un VPS (≈ 10 minutes)

**Prérequis** : une machine Linux (1 Go de RAM, 10 Go de disque suffisent pour une école), [Docker](https://docs.docker.com/engine/install/) avec Compose v2,
un **nom de domaine** dont l'enregistrement DNS (A/AAAA) pointe vers la machine, les ports **80 et 443** ouverts (Let's Encrypt en a besoin).

```sh
curl -fsSLO https://github.com/lachand/Toccata-V2/releases/latest/download/toccata-deploy.tar.gz   # ou la version de votre choix
tar xzf toccata-deploy.tar.gz && cd toccata-deploy
./install.sh --domain toccata.mon-ecole.fr --email admin@mon-ecole.fr
```

Le script pose les questions manquantes, **génère tous les secrets** (mot de passe CouchDB, clé de signature des jetons, code d'invitation),
télécharge les images, démarre la pile, attend qu'elle soit saine, puis affiche l'adresse et le **code d'invitation**.
Il est idempotent : le relancer ne change aucun secret. `./install.sh --help` liste les options (`--yes` pour ne rien demander).

Depuis les sources du dépôt, ajoutez `--build` pour construire les images localement au lieu de les télécharger.

### Premier enseignant
Ouvrez `https://toccata.mon-ecole.fr`, « Créer un compte enseignant », saisissez le **code d'invitation** affiché à l'installation
(`SIGNUP_CODE` dans `deploy/.env`). Distribuez ce code aux enseignants de l'établissement ; changez-le en modifiant `.env` puis
`docker compose up -d`.

## 2. Serveur de classe

À installer **après** le cloud. Il copie les comptes et les activités des enseignants choisis, et continue de fonctionner si Internet tombe.

```sh
./install.sh --mode classe --domain classe.mon-ecole.fr --tls internal \
  --upstream https://toccata.mon-ecole.fr/couch --upstream-user admin --upstream-password '<mot de passe CouchDB du cloud>' \
  --teachers <identifiant-enseignant-1>,<identifiant-enseignant-2>
```

- L'**identifiant technique** d'un enseignant s'affiche dans l'interface (page Classes).
- Le nom de domaine du serveur de classe doit résoudre vers lui **sur le réseau de la salle** (DNS du point d'accès, voir `deploy/hotspot/`).
- Les comptes d'élèves et de classes se **préparent sur le cloud avant la séance** ; le serveur de classe les recopie dès qu'il le joint.
- Avec `--tls internal`, chaque appareil doit **faire confiance à l'autorité locale de Caddy** : récupérez `root.crt` avec
  `docker compose cp web:/data/caddy/pki/authorities/local/root.crt .` puis installez-le sur les appareils (ou fournissez un vrai certificat : `--tls fichiers`).
- Une machine sans horloge matérielle (Raspberry Pi) doit avoir `chrony` : l'heure sert aux jetons et aux chronomètres.
Détails matériels et hotspot : [guide du serveur local](guide-serveur-local.md).

## 3. Exploitation

| Besoin | Commande |
|---|---|
| Diagnostic complet (conteneurs, HTTPS, CouchDB protégé, disque, heure, sauvegardes) | `./doctor.sh` |
| Journaux | `docker compose logs -f auth` (ou `web`, `couchdb`) |
| Sauvegarde (secrets compris) | `./backup.sh` · quotidienne : `sudo ./backup.sh --install-timer` |
| Restauration (remplace les données) | `./restore.sh backups/toccata-….tar.gz` |
| Mise à jour avec retour arrière automatique | `./update.sh --version v1.2.3` |
| Arrêt / redémarrage | `docker compose down` / `docker compose up -d` |

**Sauvegardes** : l'archive contient les secrets (`.env`, clé JWT) : stockez-la **hors du serveur** (copie chiffrée, autre machine). Sans la clé JWT d'origine,
tous les utilisateurs devront se reconnecter ; les données, elles, restent lisibles. Testez une restauration au moins une fois.

**Mises à jour** : `update.sh` sauvegarde, installe la nouvelle version, attend que le service soit sain, et **revient à l'ancienne version** sinon.

## 4. Sécurité : ce qui est déjà fait, ce qui vous revient

Déjà en place : CouchDB jamais exposé (tout passe par Caddy et un jeton court), HTTPS + HSTS, CSP stricte, inscription enseignant fermée sans code,
limitation de débit et verrouillage des connexions, mots de passe Argon2id, journaux limités en taille, conteneurs sans privilèges root pour le service.

Vous : garder le système à jour (`unattended-upgrades`), limiter SSH, n'ouvrir que 80/443 (et 22), stocker les sauvegardes ailleurs,
communiquer la politique de confidentialité aux familles ([modèle](confidentialite-modele.md)).

## 5. Dépannage

| Symptôme | Piste |
|---|---|
| Le certificat n'est pas obtenu | DNS non propagé ou port 80 fermé ; `docker compose logs web` ; `./doctor.sh` |
| `Configuration invalide` au démarrage de `auth` | variable manquante : le message liste les noms (jamais les valeurs) |
| Tout le monde est déconnecté après une restauration | la clé JWT a changé : restaurez aussi `.env` et `couchdb/secrets.ini` (l'archive les contient) |
| Indicateur « Hors ligne » alors que le réseau marche | l'interface sonde `/api/server-info` : vérifier `docker compose ps` et le proxy |
| Le serveur de classe ne rattrape pas le cloud | `./doctor.sh` (ligne « amont ») ; identifiants d'administration du cloud ; pare-feu du cloud |

## 6. Variables (`deploy/.env`, générées)

`SERVER_MODE` (cloud/local), `SERVER_HOST`, `SERVER_NAME`, `TLS_DIRECTIVE`, `HTTP_PORT`, `HTTPS_PORT`, `TOCCATA_VERSION`, `COUCHDB_ADMIN_*`, `JWT_SECRET`, `SIGNUP_CODE`,
`UPSTREAM_*` et `TEACHER_IDS` (serveur de classe). Ne jamais versionner ce fichier.
