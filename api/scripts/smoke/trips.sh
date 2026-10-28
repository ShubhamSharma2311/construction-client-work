#!/usr/bin/env bash
# Smoke check for Block 3 (trips). Needs settings with a start date before today.
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"

call POST /tractors "{\"regNumber\":\"RJ19TR${RUN}\",\"label\":\"Smoke ${RUN}\"}"
TRACTOR_ID="$(echo "$BODY" | jq .id)"
call POST /drivers "{\"name\":\"Driver ${RUN}\",\"joinedOn\":\"2026-04-01\",\"monthlySalary\":15000,\"defaultTractorId\":${TRACTOR_ID}}"
DRIVER_ID="$(echo "$BODY" | jq .id)"
call POST /customers "{\"name\":\"Trip Customer ${RUN}\"}"
CUSTOMER_ID="$(echo "$BODY" | jq .customer.id)"
call POST /khets "{\"name\":\"Smoke Khet ${RUN}\"}"
KHET_ID="$(echo "$BODY" | jq .id)"

TRIP="\"tripDate\":\"${TODAY}\",\"customerId\":${CUSTOMER_ID},\"driverId\":${DRIVER_ID},\"tractorId\":${TRACTOR_ID},\"khetId\":${KHET_ID}"

call POST /trips "{${TRIP},\"amount\":5000,\"payment\":{\"type\":\"CASH\"}}"
expect 201 "cash trip recorded"
[[ "$(echo "$BODY" | jq -r .trip.status)" == "PAID" ]] && echo "  ok: cash trip is PAID" || { echo "  FAIL: cash trip not PAID"; FAILURES=$((FAILURES + 1)); }
PAID_TRIP="$(echo "$BODY" | jq .trip.id)"

call POST /trips "{${TRIP},\"amount\":4000,\"payment\":{\"type\":\"PARTIAL\",\"paidAmount\":1500,\"mode\":\"ONLINE\"}}"
expect 201 "partial trip recorded"
[[ "$(echo "$BODY" | jq .customerBalance.balancePaise)" == "250000" ]] && echo "  ok: customer owes Rs 2500" || { echo "  FAIL: wrong balance"; FAILURES=$((FAILURES + 1)); }

KEY="smoke-replay-${RUN}"
for attempt in 1 2; do
  out="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -H "Idempotency-Key: ${KEY}" -d "{${TRIP},\"amount\":3000,\"payment\":{\"type\":\"DUE\"}}" "${BASE_URL}/trips")"
  echo "POST /trips (same key, attempt ${attempt}) -> ${out}"
done
call GET "/trips?customerId=${CUSTOMER_ID}"
[[ "$(echo "$BODY" | jq .total)" == "3" ]] && echo "  ok: double submit saved one trip (3 in total)" || { echo "  FAIL: expected 3 trips"; FAILURES=$((FAILURES + 1)); }

call DELETE "/trips/${PAID_TRIP}"
expect 409 "a paid trip is not deleted without releasing its money"
call DELETE "/trips/${PAID_TRIP}?releasePayments=true"
expect 200 "deleting with release turns the money into credit"
[[ "$(echo "$BODY" | jq .customerBalance.creditPaise)" == "500000" ]] && echo "  ok: Rs 5000 credit" || { echo "  FAIL: wrong credit"; FAILURES=$((FAILURES + 1)); }

call POST "/customers/${CUSTOMER_ID}/opening-balance" '{"amount":12000,"notes":"old register"}'
expect 201 "opening balance recorded"

call GET "/trips/export?customerId=${CUSTOMER_ID}"
expect 200 "CSV export"
echo "$BODY" | head -3

finish
