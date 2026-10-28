#!/usr/bin/env bash
# Smoke check for Block 5 (labour, royalty, police, other, emergency expenses).
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"

call POST /labourers "{\"name\":\"Labourer ${RUN}\"}"
LABOURER_ID="$(echo "$BODY" | jq .id)"

call POST /expenses "{\"category\":\"LABOUR\",\"spentOn\":\"${TODAY}\",\"amount\":700,\"mode\":\"CASH\",\"labourerId\":${LABOURER_ID}}"
expect 201 "labour paid"
call POST /expenses "{\"category\":\"ROYALTY\",\"spentOn\":\"${TODAY}\",\"amount\":25000,\"mode\":\"ONLINE\",\"periodFrom\":\"2026-10-01\",\"periodTo\":\"2026-10-31\",\"reference\":\"RCPT-${RUN}\"}"
expect 201 "royalty paid for October"
call POST /expenses "{\"category\":\"POLICE\",\"spentOn\":\"${TODAY}\",\"amount\":200,\"mode\":\"CASH\",\"notes\":\"checkpost\"}"
expect 201 "police money recorded with a note"
call POST /expenses "{\"category\":\"POLICE\",\"spentOn\":\"${TODAY}\",\"amount\":200,\"mode\":\"CASH\"}"
expect 400 "police money without a note is refused"
call POST /expenses "{\"category\":\"EMERGENCY\",\"spentOn\":\"${TODAY}\",\"amount\":1500,\"mode\":\"CASH\",\"notes\":\"tyre burst ${RUN}\"}"
expect 201 "emergency spend recorded"
EMERGENCY_ID="$(echo "$BODY" | jq .expense.id)"
call POST /expenses "{\"category\":\"OTHER\",\"spentOn\":\"${TODAY}\",\"amount\":50,\"mode\":\"CASH\",\"notes\":\"tea\",\"labourerId\":${LABOURER_ID}}"
expect 400 "a field the category does not take is refused"

call GET "/expenses?from=${TODAY}&to=${TODAY}&labourerId=${LABOURER_ID}"
expect 200 "expense list filtered by labourer"
[[ "$(echo "$BODY" | jq .totals.byCategory.LABOUR)" == "70000" ]] \
  && echo "  ok: labour total Rs 700" || { echo "  FAIL: wrong labour total"; FAILURES=$((FAILURES + 1)); }

call DELETE "/expenses/${EMERGENCY_ID}"
expect 200 "expense deleted"
call POST "/expenses/${EMERGENCY_ID}/restore"
expect 200 "expense restored"

call GET "/expenses/export?from=${TODAY}&to=${TODAY}"
expect 200 "expenses CSV"

finish
