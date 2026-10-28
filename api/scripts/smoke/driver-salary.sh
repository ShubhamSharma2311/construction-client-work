#!/usr/bin/env bash
# Smoke check for Block 8 (driver salary, advances, bonus, ledger).
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"
LAST_MONTH="$(python3 -c "y, m = map(int, '${TODAY:0:7}'.split('-')); y, m = (y - 1, 12) if m == 1 else (y, m - 1); print(f'{y}-{m:02d}')")"

call POST /drivers "{\"name\":\"Salary Driver ${RUN}\",\"joinedOn\":\"2026-04-01\",\"monthlySalary\":15000}"
DRIVER_ID="$(echo "$BODY" | jq .id)"

call POST "/drivers/${DRIVER_ID}/payments" "{\"type\":\"ADVANCE\",\"paidOn\":\"${LAST_MONTH}-05\",\"amount\":5000,\"mode\":\"CASH\"}"
expect 201 "advance paid"
call POST "/drivers/${DRIVER_ID}/close-month" "{\"month\":\"${LAST_MONTH}\"}"
expect 201 "last month closed"
[[ "$(echo "$BODY" | jq .balancePaise)" == "1000000" ]] && echo "  ok: Rs 10000 still owed after the advance" || { echo "  FAIL: wrong balance"; FAILURES=$((FAILURES + 1)); }
call POST "/drivers/${DRIVER_ID}/close-month" "{\"month\":\"${TODAY:0:7}\"}"
expect 409 "the current month cannot be closed yet"
call POST "/drivers/${DRIVER_ID}/close-month" "{\"month\":\"${LAST_MONTH}\"}"
expect 409 "a month cannot be closed twice"

call POST "/drivers/${DRIVER_ID}/payments" "{\"type\":\"SALARY\",\"paidOn\":\"${TODAY}\",\"amount\":10000,\"mode\":\"ONLINE\",\"forMonth\":\"${LAST_MONTH}\"}"
expect 201 "salary paid"
[[ "$(echo "$BODY" | jq .balancePaise)" == "0" ]] && echo "  ok: settled to zero" || { echo "  FAIL: not settled"; FAILURES=$((FAILURES + 1)); }

call POST "/drivers/${DRIVER_ID}/bonus" "{\"paidOn\":\"${TODAY}\",\"amount\":1000,\"mode\":\"CASH\",\"note\":\"festival\"}"
expect 201 "bonus paid"

call GET "/drivers/${DRIVER_ID}/ledger"
expect 200 "driver ledger"
[[ "$(echo "$BODY" | jq '.entries | length')" == "5" ]] && echo "  ok: ledger has 5 lines" || { echo "  FAIL: wrong ledger lines"; FAILURES=$((FAILURES + 1)); }

call POST "/drivers/${DRIVER_ID}/payments" "{\"type\":\"ADVANCE\",\"paidOn\":\"${TODAY}\",\"amount\":700,\"mode\":\"CASH\"}"
call PATCH "/drivers/${DRIVER_ID}" '{"isActive":false}'
expect 200 "driver deactivated"
[[ "$(echo "$BODY" | jq -r '.warnings[0]')" == *"still holds"* ]] && echo "  ok: warned about the advance held" || { echo "  FAIL: no balance warning"; FAILURES=$((FAILURES + 1)); }

call GET "/driver-payments/export?driverId=${DRIVER_ID}"
expect 200 "driver payments CSV"

finish
