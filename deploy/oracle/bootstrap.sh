#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
test -s /home/ubuntu/.ssh/authorized_keys
admin_cidr=${1:?pass administrator CIDR}
python3 -c 'import ipaddress,sys; ipaddress.ip_network(sys.argv[1])' "$admin_cidr"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y git podman uidmap slirp4netns fuse-overlayfs dbus-user-session netavark aardvark-dns ufw fail2ban unattended-upgrades python3-boto3 postgresql-client curl ca-certificates
if ! command -v /usr/lib/postgresql/18/bin/pg_dump >/dev/null; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list
  apt-get update
  apt-get install -y postgresql-client-18
fi
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos '' deploy
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
install -o deploy -g deploy -m 600 /home/ubuntu/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
loginctl enable-linger deploy
systemctl start "user@$(id -u deploy).service"
printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'PubkeyAuthentication yes' > /etc/ssh/sshd_config.d/00-gdg.conf
sshd -t
systemctl reload ssh
ufw default deny incoming
ufw allow from "$admin_cidr" to any port 22 proto tcp
ufw --force enable
printf '[sshd]\nenabled=true\nbackend=systemd\n' > /etc/fail2ban/jail.d/gdg.local
systemctl enable --now fail2ban unattended-upgrades
systemctl restart fail2ban
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=256M\nRuntimeMaxUse=64M\nMaxRetentionSec=14day\n' > /etc/systemd/journald.conf.d/gdg.conf
systemctl restart systemd-journald
if ! swapon --noheadings --show | grep -q .; then
  if [[ ! -e /swap-gdg ]]; then
    install -m 600 /dev/null /swap-gdg
    fallocate -l 2G /swap-gdg
    mkswap /swap-gdg
  fi
  swapon /swap-gdg
  grep -q '^/swap-gdg ' /etc/fstab || echo '/swap-gdg none swap sw 0 0' >> /etc/fstab
fi
