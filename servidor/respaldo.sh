#!/usr/bin/env bash
# Guarda una copia de la base de datos en ./respaldos y borra las de más de 14 días.
# Para hacerlo cada noche a las 3:00:  (crontab -l; echo "0 3 * * * $(pwd)/respaldo.sh") | crontab -
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p respaldos
docker compose exec -T db pg_dump -U traccar traccar | gzip > "respaldos/traccar-$(date +%F).sql.gz"
find respaldos -name '*.sql.gz' -mtime +14 -delete
echo "Respaldo guardado en respaldos/traccar-$(date +%F).sql.gz"
