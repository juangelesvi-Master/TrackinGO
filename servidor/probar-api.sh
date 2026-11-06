#!/usr/bin/env bash
# Revisa que la API de Traccar conteste bien y que cada usuario solo vea lo suyo.
# Se corre EN EL SERVIDOR (no manda nada a internet):
#   cd ~/TrackinGO/servidor && bash probar-api.sh
# Pide tu usuario y contraseña; no se guardan en ningún lado (la sesión se borra al terminar).
# Opcional: al final puedes probar con un segundo usuario (que NO sea administrador)
# para confirmar que no puede ver los vehículos de otros.
set -uo pipefail

API="${API:-http://localhost:8082/api}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ok=0; fail=0

check() { # check "nombre" código_esperado código_obtenido
  if [ "$3" = "$2" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 (esperaba $2, salió $3)"; fail=$((fail+1)); fi
}
code() { curl -s -o "$TMP/body" -w "%{http_code}" "$@"; }
ids() { python3 -c 'import json,sys; print(" ".join(str(d["id"]) for d in json.load(open(sys.argv[1]))))' "$1" 2>/dev/null; }

login() { # login archivo_de_sesión
  local user pass
  read -rp "Usuario (correo): " user
  read -rsp "Contraseña: " pass; echo
  local c
  c=$(curl -s -o /dev/null -w "%{http_code}" -c "$1" --data-urlencode "email=$user" --data-urlencode "password=$pass" "$API/session")
  unset pass
  [ "$c" = "200" ]
}

echo "== Servidor =="
check "El servidor contesta (/server)" 200 "$(code "$API/server")"
check "Sin sesión no se ven vehículos (/devices → 401)" 401 "$(code "$API/devices")"

echo; echo "== Iniciar sesión =="
if ! login "$TMP/s1"; then echo "❌ Usuario o contraseña incorrectos."; exit 1; fi
S=(-b "$TMP/s1")
echo "  ✅ Sesión iniciada"

echo; echo "== Endpoints que usa la app =="
for p in session devices positions geofences notifications notifications/notificators drivers maintenance users; do
  check "/$p" 200 "$(code "${S[@]}" "$API/$p")"
done
code "${S[@]}" "$API/devices" >/dev/null; cp "$TMP/body" "$TMP/dev1"
DEV1="$(ids "$TMP/dev1")"
FIRST="${DEV1%% *}"
echo "  Vehículos que ves: $(echo $DEV1 | wc -w)"
if [ -n "$FIRST" ]; then
  FROM="$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ)"; TO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  Q="deviceId=$FIRST&from=$FROM&to=$TO"
  check "/commands/types" 200 "$(code "${S[@]}" "$API/commands/types?deviceId=$FIRST")"
  for r in route stops trips summary events; do
    check "/reports/$r" 200 "$(code "${S[@]}" "$API/reports/$r?$Q")"
  done
fi

echo; read -rp "¿Probar con un segundo usuario que NO sea administrador? (s/n): " again
if [ "$again" = "s" ]; then
  if login "$TMP/s2"; then
    S2=(-b "$TMP/s2")
    code "${S2[@]}" "$API/devices" >/dev/null; DEV2=" $(ids "$TMP/body") "
    echo "  El segundo usuario ve $(echo $DEV2 | wc -w) vehículos."
    for id in $DEV1; do
      case "$DEV2" in *" $id "*) continue ;; esac
      c=$(code "${S2[@]}" "$API/positions?deviceId=$id")
      if [ "$c" = "200" ] && [ "$(cat "$TMP/body")" != "[]" ]; then
        echo "  ❌ ¡Puede ver la posición del vehículo $id que no es suyo!"; fail=$((fail+1))
      else
        echo "  ✅ No puede ver el vehículo $id (no es suyo)"; ok=$((ok+1))
      fi
    done
    curl -s -o /dev/null -b "$TMP/s2" -X DELETE "$API/session"
  else
    echo "  ❌ Usuario o contraseña incorrectos."
  fi
fi

curl -s -o /dev/null "${S[@]}" -X DELETE "$API/session"
echo; echo "Resultado: $ok bien, $fail con problema."
[ "$fail" = 0 ]
