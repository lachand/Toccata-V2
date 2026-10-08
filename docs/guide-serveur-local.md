# Guide du serveur de classe

Un **serveur de classe** est un petit ordinateur (Raspberry Pi, mini-PC) posé dans la salle. Élèves et enseignant s'y connectent par le Wi-Fi de la
classe ; **tout continue de fonctionner sans Internet**, et le serveur se resynchronise avec le cloud dès qu'une connexion revient (câble,
partage de connexion 4G). C'est la réponse de Toccata aux sorties, aux salles sans réseau et aux réseaux d'établissement instables.

```
 tablettes ─── Wi-Fi de la classe ───▶ serveur de classe ═══(Internet, quand il y en a)═══▶ cloud
              https://classe.exemple.org   CouchDB + authentification + application
```

## Ce qu'il faut

- Un Raspberry Pi 4 ou 5 (4 Go), une carte microSD **endurante** ou un SSD, une alimentation (ou une batterie USB-C PD), de préférence un **module
  d'horloge** (RTC) : sans Internet, un Pi redémarre avec une heure fausse.
- Un **nom de domaine** que vous maîtrisez (`classe.exemple.org`), dont l'adresse pointe vers le serveur *sur le réseau de la classe* (le script du point
  d'accès s'en charge). Il permet un vrai certificat HTTPS ; sans HTTPS, l'application ne s'installe pas et ne fonctionne pas hors ligne.
- Docker et Docker Compose sur le Pi ; un compte administrateur sur le CouchDB du cloud (voir le guide du cloud).

## Avant la séance (sur le cloud, avec Internet)

1. Créez vos **classes et les comptes élèves**, imprimez les fiches d'identifiants. **En classe, les comptes sont en lecture seule** : créer un élève
   ou réinitialiser une phrase de passe se fait sur le cloud.
2. Créez l'activité et ses groupes si vous les connaissez déjà ; sinon vous le ferez en classe (c'est permis).
3. Relevez votre **identifiant d'enseignant** : page *Classes*, carte « Serveur de classe ».

## Installation

```sh
cd apps/local-server
./make-secrets.sh                 # écrit .env et couchdb/secrets.ini (droits 600, jamais versionnés) : mot de passe CouchDB, clé JWT PROPRE à ce serveur
$EDITOR .env                      # SERVER_HOST, UPSTREAM_COUCHDB_URL, UPSTREAM_ADMIN_*, TEACHER_IDS
(cd ../.. && pnpm install && pnpm --filter @toccata/web build)   # sur une machine de développement : copiez ensuite apps/web/dist sur le Pi
docker compose up -d --build
```

**Certificat.** Deux choix, via `TLS_DIRECTIVE` dans `.env` :
- `tls /certs/fullchain.pem /certs/privkey.pem` (recommandé) : obtenez un certificat pour votre domaine sur une machine connectée (par exemple avec
  `certbot` et un défi DNS), copiez-le dans `apps/local-server/certs/` et renouvelez-le régulièrement ;
- `tls internal` : Caddy crée sa propre autorité ; il faut **installer son certificat racine sur chaque appareil** (`caddy-data`, fichier `root.crt`).

**Wi-Fi de la classe** (Raspberry Pi OS avec NetworkManager) :

```sh
sudo SSID=Classe-4B PSK='mot-de-passe-wifi' DOMAIN=classe.exemple.org ./hotspot/setup-hotspot.sh
```

> Le script du point d'accès et le certificat réel n'ont **pas** pu être testés dans le dépôt (pas de matériel). Essayez-les une fois, avec Internet,
> *avant* le jour J.

## Le jour J

1. Allumez le serveur ; patientez une minute. Connectez-vous au Wi-Fi de la classe, ouvrez `https://classe.exemple.org`.
2. L'indicateur en haut à droite dit :
   - **« Serveur de classe »** : tout est synchronisé avec le cloud ;
   - **« Serveur de classe · pas d'Internet, tout est gardé ici »** : le travail est enregistré sur le serveur de classe et partira au retour d'Internet ;
   - **« Hors ligne… »** : l'appareil ne joint plus le serveur de classe (Wi-Fi) ; son travail est gardé sur l'appareil et repart au retour.
3. Suivi, miroir, télécommande, chronomètres, messages : comme sur le cloud.

## Pannes

| Constat | Que faire |
|---|---|
| Plus d'Internet | Rien. Continuez. Au retour, les deux serveurs se rattrapent seuls (des dizaines de secondes à quelques minutes selon le volume). |
| L'indicateur reste sur « pas d'Internet » alors qu'il est revenu | Vérifiez `docker compose logs auth` ; l'adresse `UPSTREAM_COUCHDB_URL` doit être joignable depuis le conteneur CouchDB. |
| Un élève ne se connecte pas en classe | Son compte a été créé après la dernière synchronisation : reconnectez le serveur à Internet quelques minutes. |
| Le serveur est tombé | `docker compose up -d`. Les données sont dans le volume `couchdb-data`. |

## Sauvegarde et mise à jour

- Sauvegarde : le volume `couchdb-data` (arrêtez la pile ou utilisez `docker run --volumes-from`). Le cloud détient une copie dès que la synchronisation a eu lieu.
- Mise à jour : `git pull`, reconstruisez l'interface, `docker compose up -d --build`.

## Sécurité et limites

- La clé JWT du serveur de classe est **distincte** de celle du cloud : un serveur volé ne permet pas de se faire passer pour quelqu'un sur le cloud.
- Il contient les **hachés des mots de passe** de vos élèves et de vous-même : chiffrez le disque ; le périmètre est limité aux enseignants listés dans `TEACHER_IDS`.
- CouchDB n'est jamais exposé directement : tout passe par Caddy et exige un jeton.
- Une inscription (membres d'un groupe) modifiée en même temps sur les deux serveurs : « dernier écrit gagne ».
- Pas de notifications hors de l'application (Web Push) pour l'instant.

Détails techniques : [ADR 0015](adr/0015-serveur-de-classe.md).
