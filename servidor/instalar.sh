#!/usr/bin/env bash
# Instala y arranca Teesa Location en un servidor Ubuntu limpio (por ejemplo, un Droplet de DigitalOcean).
# Ejecutar desde esta carpeta:  sudo ./instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Falta el archivo .env. Copia .env.example a .env y llénalo:  cp .env.example .env && nano .env"
  exit 1
fi
if grep -q "cambia-esta-contraseña" .env || grep -q "gps.tuempresa.com" .env; then
  echo "Primero cambia DOMAIN y DB_PASSWORD en el archivo .env."
  exit 1
fi

if ! command -v docker >/dev/null; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

command -v jq >/dev/null || apt-get install -y jq >/dev/null

echo "Configurando el firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw allow 5000:5150/tcp
ufw allow 5000:5150/udp
ufw --force enable

echo "Arrancando Traccar, la base de datos y la app (la primera vez tarda unos minutos)..."
docker compose up -d --build

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
echo
echo "Listo. Ahora crea tu cuenta Maestro (GUIA.md, paso 5) y después entra a https://$DOMAIN"
