#!/bin/sh
# Point d'accès Wi-Fi pour la classe, sur Raspberry Pi OS (NetworkManager). NON TESTÉ dans le dépôt : à vérifier sur le matériel.
#   sudo SSID=Classe-4B PSK='mot-de-passe-wifi' DOMAIN=classe.example.org ./setup-hotspot.sh
# Le mode « partagé » de NetworkManager lance dnsmasq (DHCP + DNS) ; on y ajoute le nom du serveur de classe pour qu'il
# résolve vers le Pi même sans Internet. Internet (partage de connexion 4G, câble) reste utilisé quand il est là.
set -eu
: "${SSID:?}" "${PSK:?}" "${DOMAIN:?}"
ADDR="${ADDR:-192.168.4.1}"
nmcli con delete toccata-hotspot >/dev/null 2>&1 || true
nmcli con add type wifi ifname wlan0 con-name toccata-hotspot autoconnect yes ssid "$SSID" \
  802-11-wireless.mode ap 802-11-wireless.band bg \
  ipv4.method shared ipv4.addresses "$ADDR/24" \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK"
mkdir -p /etc/NetworkManager/dnsmasq-shared.d
echo "address=/$DOMAIN/$ADDR" > /etc/NetworkManager/dnsmasq-shared.d/toccata.conf
nmcli con up toccata-hotspot
# Heure : un Pi sans horloge matérielle redémarre hors ligne avec une heure fausse. chrony la corrige dès qu'Internet revient.
apt-get install -y chrony >/dev/null 2>&1 || true
echo "Point d'accès « $SSID » actif ; $DOMAIN → $ADDR. Pensez à une horloge matérielle (RTC) pour les classes sans Internet."
