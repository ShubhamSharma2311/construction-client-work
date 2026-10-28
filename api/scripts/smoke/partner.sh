#!/usr/bin/env bash
# Smoke check for Block 9 (partner account).
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"

call POST /partners "{\"name\":\"Manish ${RUN}\",\"sharePercent\":50}"
PARTNER_ID="$(echo "$BODY" | jq .id)"

call POST "/partners/${PARTNER_ID}/txns" "{\"direction\":\"PAID_TO_PARTNER\",\"txnDate\":\"${TODAY}\",\"amount\":10000,\"mode\":\"ONLINE\",\"notes\":\"share\"}"
expect 201 "paid Manish Rs 10000"
call POST "/partners/${PARTNER_ID}/txns" "{\"direction\":\"RECEIVED_FROM_PARTNER\",\"txnDate\":\"${TODAY}\",\"amount\":2500,\"mode\":\"CASH\"}"
expect 201 "Manish put back Rs 2500"
[[ "$(echo "$BODY" | jq .netPaidPaise)" == "750000" ]] && echo "  ok: net paid Rs 7500" || { echo "  FAIL: wrong net"; FAILURES=$((FAILURES + 1)); }
TXN_ID="$(echo "$BODY" | jq .txn.id)"

call PATCH "/partner-txns/${TXN_ID}" '{"amount":3000}'
expect 200 "transaction corrected"
call GET "/partners/${PARTNER_ID}/ledger"
expect 200 "partner ledger"
[[ "$(echo "$BODY" | jq .closingNetPaidPaise)" == "700000" ]] && echo "  ok: ledger closes at Rs 7000" || { echo "  FAIL: wrong ledger"; FAILURES=$((FAILURES + 1)); }

call GET "/partner-txns/export?partnerId=${PARTNER_ID}"
expect 200 "partner CSV"

finish
