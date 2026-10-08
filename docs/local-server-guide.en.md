# Class server guide

A **class server** is a small computer (Raspberry Pi, mini-PC) placed in the room. Students and teacher connect to it over the classroom Wi-Fi;
**everything keeps working without Internet**, and the server catches up with the cloud as soon as a connection comes back (cable, 4G tethering).

```
 tablets ─── classroom Wi-Fi ───▶ class server ═══(Internet, when there is some)═══▶ cloud
            https://class.example.org   CouchDB + authentication + app
```

## What you need

- A Raspberry Pi 4/5 (4 GB), an endurance microSD card or SSD, a power supply (or USB-C PD battery), ideally a **real-time clock** module: without Internet a Pi
  boots with a wrong time.
- A **domain name** you control (`class.example.org`) pointing at the server *on the classroom network* (the hotspot script handles that). It allows a real HTTPS
  certificate; without HTTPS the app cannot install or work offline.
- Docker and Docker Compose on the Pi; an admin account on the cloud CouchDB.

## Before the lesson (on the cloud, online)

1. Create your **classes and student accounts** and print the credential sheets. **In class, accounts are read-only**: creating a student or resetting a
   passphrase is done on the cloud.
2. Create the activity (and groups if known). Groups can also be created in class.
3. Note your **teacher identifier**: *Classes* page, “Class server” card.

## Installation

The class server uses the **same package as the cloud** (`deploy/`, see the [deployment guide](deployment-guide.en.md)):

```sh
cd deploy
./install.sh --mode classe --domain class.example.org --tls internal \
  --upstream https://toccata.example.org/couch --upstream-user admin --upstream-password '<cloud CouchDB password>' \
  --teachers <your-teacher-identifier>
```

The script generates the CouchDB password and a JWT key OWN to this server, starts the stack and checks its health; `./doctor.sh` also reports the link with the cloud.

**Certificate** (`--tls`): `fichiers` (recommended; get the certificate on a connected machine, e.g. certbot with a DNS challenge, copy `fullchain.pem` and `privkey.pem` to `deploy/certs/`)
or `internal` (Caddy's own CA; install its root certificate on every device: `docker compose cp web:/data/caddy/pki/authorities/local/root.crt .`).

**Classroom Wi-Fi**: `sudo SSID=Class-4B PSK='…' DOMAIN=class.example.org ./hotspot/setup-hotspot.sh` (from `deploy/`).

> The hotspot script and a real certificate could **not** be tested in the repository (no hardware). Try them once, online, *before* the day.

## On the day

Switch the server on, wait a minute, join the Wi-Fi, open `https://class.example.org`. The status indicator reads **“Class server”** (in sync with the cloud),
**“Class server · no Internet, saved here”** (work is kept on the class server and will go up later) or **“Offline…”** (this device cannot reach the class server; its work
is kept on the device).

## Limits

Class accounts are read-only; group membership edited on both servers at once is last-writer-wins; password hashes of the served teachers' accounts live on the class
server (encrypt the disk); a Pi without an RTC starts with a wrong clock; no Web Push. See [ADR 0015](adr/0015-serveur-de-classe.md).
