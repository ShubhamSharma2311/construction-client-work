#!/usr/bin/env bash
# Smoke check for Block 4 (payments and dues). Needs settings with a start date before today.
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"

call POST /tractors "{\"regNumber\":\"RJ19PY${RUN}\",\"label\":\"Smoke ${RUN}\"}"
TRACTOR_ID="$(echo "$BODY" | jq .id)"
call POST /drivers "{\"name\":\"Driver ${RUN}\",\"joinedOn\":\"2026-04-01\",\"monthlySalary\":15000,\"defaultTractorId\":${TRACTOR_ID}}"
DRIVER_ID="$(echo "$BODY" | jq .id)"
call POST /customers "{\"name\":\"Pay Customer ${RUN}\"}"
CUSTOMER_ID="$(echo "$BODY" | jq .customer.id)"
call POST /khets "{\"name\":\"Pay Khet ${RUN}\"}"
KHET_ID="$(echo "$BODY" | jq .id)"
TRIP="\"tripDate\":\"${TODAY}\",\"customerId\":${CUSTOMER_ID},\"driverId\":${DRIVER_ID},\"tractorId\":${TRACTOR_ID},\"khetId\":${KHET_ID},\"payment\":{\"type\":\"DUE\"}"

call POST "/customers/${CUSTOMER_ID}/opening-balance" '{"amount":1000}'
call POST /trips "{${TRIP},\"amount\":5000}"
call POST /trips "{${TRIP},\"amount\":3000}"

call GET /dues
expect 200 "dues list"
[[ "$(echo "$BODY" | jq "[.customers[] | select(.customer.id == ${CUSTOMER_ID}) | .balancePaise][0]")" == "900000" ]] \
  && echo "  ok: customer owes Rs 9000" || { echo "  FAIL: wrong due"; FAILURES=$((FAILURES + 1)); }

call POST "/customers/${CUSTOMER_ID}/payments" "{\"kind\":\"PAYMENT\",\"paidOn\":\"${TODAY}\",\"amount\":4000,\"mode\":\"ONLINE\",\"reference\":\"SMOKE-${RUN}\"}"
expect 201 "payment clears oldest dues first"
[[ "$(echo "$BODY" | jq -r '[.payment.allocations[].tripKind] | first')" == "OPENING_BALANCE" ]] \
  && echo "  ok: register due paid first" || { echo "  FAIL: register due not first"; FAILURES=$((FAILURES + 1)); }
PAYMENT_ID="$(echo "$BODY" | jq .payment.id)"

call POST "/customers/${CUSTOMER_ID}/payments" "{\"kind\":\"PAYMENT\",\"paidOn\":\"${TODAY}\",\"amount\":10,\"mode\":\"ONLINE\",\"reference\":\"SMOKE-${RUN}\"}"
expect 409 "the same UPI reference is refused"

call POST "/customers/${CUSTOMER_ID}/payments" "{\"kind\":\"WRITE_OFF\",\"paidOn\":\"${TODAY}\",\"amount\":99999}"
expect 409 "a write-off larger than the due is refused"

call POST "/customers/${CUSTOMER_ID}/payments" "{\"kind\":\"WRITE_OFF\",\"paidOn\":\"${TODAY}\",\"amount\":500}"
expect 201 "a Rs 500 write-off is recorded"

call GET "/customers/${CUSTOMER_ID}/ledger"
expect 200 "ledger"
[[ "$(echo "$BODY" | jq .closingBalancePaise)" == "450000" ]] \
  && echo "  ok: ledger closes at Rs 4500" || { echo "  FAIL: wrong closing balance"; FAILURES=$((FAILURES + 1)); }

call DELETE "/payments/${PAYMENT_ID}"
expect 200 "payment reversed"
[[ "$(echo "$BODY" | jq .customerBalance.balancePaise)" == "850000" ]] \
  && echo "  ok: reversal puts Rs 4000 back on the due" || { echo "  FAIL: wrong balance after reversal"; FAILURES=$((FAILURES + 1)); }

call GET "/customers/${CUSTOMER_ID}/ledger/export"
expect 200 "ledger CSV"
call GET /dues/export
expect 200 "dues CSV"

finish
