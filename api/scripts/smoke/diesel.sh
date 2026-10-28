#!/usr/bin/env bash
# Smoke check for Block 6 (diesel fills and the diesel report).
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"

call POST /tractors "{\"regNumber\":\"RJ19DS${RUN}\",\"label\":\"Diesel ${RUN}\"}"
TRACTOR_ID="$(echo "$BODY" | jq .id)"
call POST /drivers "{\"name\":\"Diesel Driver ${RUN}\",\"joinedOn\":\"2026-04-01\",\"monthlySalary\":15000,\"defaultTractorId\":${TRACTOR_ID}}"
DRIVER_ID="$(echo "$BODY" | jq .id)"

FILL="\"category\":\"DIESEL\",\"spentOn\":\"${TODAY}\",\"mode\":\"CASH\",\"tractorId\":${TRACTOR_ID},\"driverId\":${DRIVER_ID}"
call POST /expenses "{${FILL},\"litres\":\"45.5\",\"amount\":4095}"
expect 201 "45.5 litres recorded"
[[ "$(echo "$BODY" | jq '.warnings | length')" == "0" ]] && echo "  ok: normal price, no warning" || { echo "  FAIL: unexpected warning"; FAILURES=$((FAILURES + 1)); }

call POST /expenses "{${FILL},\"litres\":45,\"amount\":9000}"
expect 201 "typo fill still saved"
[[ "$(echo "$BODY" | jq -r '.warnings[0]')" == *"per litre looks wrong"* ]] && echo "  ok: price typo warned" || { echo "  FAIL: no price warning"; FAILURES=$((FAILURES + 1)); }

call POST /expenses "{\"category\":\"DIESEL\",\"spentOn\":\"${TODAY}\",\"mode\":\"CASH\",\"tractorId\":${TRACTOR_ID},\"litres\":10,\"amount\":900}"
expect 400 "a fill without a driver is refused"

call GET "/reports/diesel?from=${TODAY}&to=${TODAY}"
expect 200 "diesel report"
[[ "$(echo "$BODY" | jq "[.tractors[] | select(.tractor.id == ${TRACTOR_ID}) | .litres][0]")" == "90.5" ]] \
  && echo "  ok: tractor shows 90.5 litres" || { echo "  FAIL: wrong litres"; FAILURES=$((FAILURES + 1)); }

call GET "/reports/diesel/export?from=${TODAY}&to=${TODAY}"
expect 200 "diesel CSV"

finish
