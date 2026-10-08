# Toccata deployment guide

For the person who **installs and runs** Toccata. Two installations use **the same package** (`deploy/`):

| | Cloud | Class server |
|---|---|---|
| Role | Reference server, reachable from the Internet | Local copy (Raspberry Pi, mini-PC) that works **without Internet** during a session |
| Where | A VPS / VM | In the classroom |
| Certificate | Let's Encrypt, automatic | Caddy's local CA or a provided certificate |
| Accounts | Created here (teacher sign-up needs an invitation code) | Copied from the cloud, **read-only** |

## 1. Cloud on a VPS (≈ 10 minutes)

**Requirements**: a Linux machine (1 GB RAM, 10 GB disk are enough for a school), [Docker](https://docs.docker.com/engine/install/) with Compose v2, a **domain name** whose DNS record points at the machine, ports **80 and 443** open.

```sh
curl -fsSLO https://github.com/lachand/Toccata-V2/releases/latest/download/toccata-deploy.tar.gz
tar xzf toccata-deploy.tar.gz && cd toccata-deploy
./install.sh --domain toccata.my-school.org --email admin@my-school.org
```

The script asks for anything missing, **generates every secret** (CouchDB password, token-signing key, invitation code), pulls the images, starts the stack, waits until it is healthy and prints the URL and the **invitation code**.
It is idempotent: running it again changes no secret. `./install.sh --help` lists the options (`--yes` asks nothing; `--build` builds the images from the repository sources).

First teacher: open the site → *Create a teacher account* → enter the invitation code (`SIGNUP_CODE` in `deploy/.env`) and give it to your colleagues.

## 2. Class server
Install it **after** the cloud:

```sh
./install.sh --mode classe --domain class.my-school.org --tls internal \
  --upstream https://toccata.my-school.org/couch --upstream-user admin --upstream-password '<cloud CouchDB password>' \
  --teachers <teacher-identifier-1>,<teacher-identifier-2>
```
Teacher identifiers are shown in the app (Classes page). The domain must resolve to the server **on the classroom network** (see `deploy/hotspot/`). Accounts are prepared on the cloud beforehand. With `--tls internal`, install Caddy's root certificate on devices
(`docker compose cp web:/data/caddy/pki/authorities/local/root.crt .`) or provide a real certificate (`--tls fichiers`, files in `deploy/certs/`). Machines without a hardware clock (Raspberry Pi) need `chrony`. See the [class server guide](local-server-guide.en.md).

## 3. Operations
| Need | Command |
|---|---|
| Full diagnosis | `./doctor.sh` |
| Logs | `docker compose logs -f auth` |
| Backup (secrets included) | `./backup.sh` · daily: `sudo ./backup.sh --install-timer` |
| Restore (replaces data) | `./restore.sh backups/toccata-….tar.gz` |
| Update with automatic rollback | `./update.sh --version v1.2.3` |

Backups contain secrets: store them **off the server**. Test a restore at least once.

## 4. Security
Already done: CouchDB never exposed (Caddy + short-lived tokens), HTTPS + HSTS, strict CSP, teacher sign-up closed without a code, rate limiting and lockouts, Argon2id, size-limited logs, non-root service container.
Yours: OS updates, SSH hardening, only 80/443/22 open, off-site backups, a privacy notice for families ([template, in French](confidentialite-modele.md)).

## 5. Troubleshooting
| Symptom | Hint |
|---|---|
| No certificate | DNS not propagated or port 80 closed; `docker compose logs web`; `./doctor.sh` |
| `Configuration invalide` at `auth` start | a variable is missing: the message lists names, never values |
| Everyone signed out after a restore | the JWT key changed: restore `.env` and `couchdb/secrets.ini` too (the archive holds them) |
| Class server does not catch up with the cloud | `./doctor.sh` (upstream line); cloud admin credentials; cloud firewall |
