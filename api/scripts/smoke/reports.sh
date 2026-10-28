#!/usr/bin/env bash
# Smoke check for Block 10 (reports, cash book, dashboard, partner share) on whatever data exists.
source "$(dirname "$0")/lib.sh"
wait_for_server
login

TODAY="$(TZ=Asia/Kolkata date +%F)"
RANGE="from=2026-04-01&to=${TODAY}"

call GET "/reports/pnl?${RANGE}"
expect 200 "profit and loss"
P="$(echo "$BODY" | jq '.revenue.netPaise - .expenses.totalPaise - .driverSalaryPaise == .profitPaise')"
[[ "$P" == "true" ]] && echo "  ok: profit = revenue - expenses - salary" || { echo "  FAIL: P&L does not add up"; FAILURES=$((FAILURES + 1)); }

call GET "/reports/cashbook?mode=CASH&${RANGE}"
expect 200 "cash book"
C="$(echo "$BODY" | jq '.openingPaise + .totals.inPaise - .totals.outPaise == .closingPaise')"
[[ "$C" == "true" ]] && echo "  ok: cash book closes on opening + in - out" || { echo "  FAIL: cash book does not add up"; FAILURES=$((FAILURES + 1)); }
CASH_CLOSING="$(echo "$BODY" | jq .closingPaise)"

call GET /dashboard
expect 200 "dashboard"
[[ "$(echo "$BODY" | jq .cashInHandPaise)" == "$CASH_CLOSING" ]] && echo "  ok: dashboard cash in hand matches the cash book" || { echo "  FAIL: cash in hand differs"; FAILURES=$((FAILURES + 1)); }

call GET "/reports/summary?from=2026-10-01&to=${TODAY}"
expect 200 "daily summary"
call GET "/reports/tractors?${RANGE}"
expect 200 "tractor report"
call GET "/reports/khets?${RANGE}"
expect 200 "khet report"
call GET "/reports/drivers?${RANGE}"
expect 200 "driver report"

call GET "/partners?search=manish&active=all"
PARTNER_ID="$(echo "$BODY" | jq '[.items[] | select(.sharePercent != null)][0].id')"
call GET "/partners/${PARTNER_ID}/share?${RANGE}"
expect 200 "partner share"

call GET "/reports/pnl?from=2026-01-01&to=${TODAY}"
expect 400 "a report before the business start is refused"

for report in pnl summary tractors; do
  call GET "/reports/${report}/export?from=2026-10-01&to=${TODAY}"
  expect 200 "${report} CSV"
done

finish
