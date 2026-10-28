#!/usr/bin/env bash
# Smoke check for Block 2 (settings and masters). Safe to re-run: values are randomised.
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
PHONE="98$(printf '%08d' "$((RANDOM * RANDOM % 100000000))")"

call PUT /settings '{"businessName":"Godara Bajri","businessStartDate":"2026-04-01","openingCash":"15000","openingOnline":0}'
expect 200 "settings saved"

call POST /customers "{\"name\":\"Ramesh ${RUN}\",\"phone\":\"${PHONE}\",\"village\":\"Bilara\"}"
expect 201 "customer created"
CUSTOMER_ID="$(echo "$BODY" | jq .customer.id)"

call POST /customers "{\"name\":\"Other ${RUN}\",\"phone\":\"+91 ${PHONE}\"}"
expect 409 "same phone written differently is refused"

call POST /tractors "{\"regNumber\":\"rj 19 sm ${RUN}\",\"label\":\"Swaraj ${RUN}\"}"
expect 201 "tractor created with normalised number"
TRACTOR_ID="$(echo "$BODY" | jq .id)"

call POST /drivers "{\"name\":\"Bhagirath ${RUN}\",\"joinedOn\":\"2026-04-15\",\"monthlySalary\":15000,\"defaultTractorId\":${TRACTOR_ID}}"
expect 201 "driver created on that tractor"
DRIVER_ID="$(echo "$BODY" | jq .id)"

call POST /drivers "{\"name\":\"Second ${RUN}\",\"joinedOn\":\"2026-04-15\",\"monthlySalary\":15000,\"defaultTractorId\":${TRACTOR_ID}}"
expect 409 "the tractor cannot be a second driver's usual tractor"

call POST "/drivers/${DRIVER_ID}/salary-rates" '{"effectiveFrom":"2026-03","monthlySalary":16000}'
expect 409 "no salary rate before the joining month"

call POST /khets "{\"name\":\"Luni Nadi ${RUN}\"}"
expect 201 "khet created"
call POST /khets "{\"name\":\"LUNI  nadi ${RUN}\"}"
expect 409 "same khet name in another case is refused"

call POST /partners '{"name":"Manish","sharePercent":33.33}'
expect 201 "partner created"

call PATCH "/customers/${CUSTOMER_ID}" '{"village":"Pipar"}'
expect 200 "customer updated"
call GET "/audit?entity=Customer&entityId=${CUSTOMER_ID}"
expect 200 "audit history readable"
[[ "$(echo "$BODY" | jq '[.items[].action] | join(",")' -r)" == "UPDATE,CREATE" ]] \
  && echo "  ok: history shows UPDATE then CREATE" || { echo "  FAIL: wrong audit history"; FAILURES=$((FAILURES + 1)); }

finish
