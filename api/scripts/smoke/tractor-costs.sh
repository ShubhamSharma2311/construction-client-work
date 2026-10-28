#!/usr/bin/env bash
# Smoke check for Block 7 (tractor service, loans and EMI).
source "$(dirname "$0")/lib.sh"
wait_for_server
login

RUN="$RANDOM"
TODAY="$(TZ=Asia/Kolkata date +%F)"
THIS_MONTH="${TODAY:0:7}"

call POST /tractors "{\"regNumber\":\"RJ19LN${RUN}\",\"label\":\"Loan ${RUN}\"}"
TRACTOR_ID="$(echo "$BODY" | jq .id)"

call POST /expenses "{\"category\":\"TRACTOR_SERVICE\",\"spentOn\":\"${TODAY}\",\"amount\":3500,\"mode\":\"CASH\",\"tractorId\":${TRACTOR_ID},\"notes\":\"oil change\",\"hourMeter\":1250}"
expect 201 "service recorded"
call GET "/tractors/${TRACTOR_ID}/services"
[[ "$(echo "$BODY" | jq .lastService.hourMeter)" == "1250" ]] && echo "  ok: last service shows 1250 hours" || { echo "  FAIL: wrong last service"; FAILURES=$((FAILURES + 1)); }

call POST "/tractors/${TRACTOR_ID}/loans" "{\"lender\":\"Mahindra Finance\",\"emiAmount\":25000,\"emiDay\":10,\"firstEmiMonth\":\"${THIS_MONTH}\",\"totalInstallments\":2}"
expect 201 "loan created"
LOAN_ID="$(echo "$BODY" | jq .id)"
call POST "/tractors/${TRACTOR_ID}/loans" "{\"lender\":\"Second\",\"emiAmount\":1000,\"emiDay\":5,\"firstEmiMonth\":\"${THIS_MONTH}\",\"totalInstallments\":2}"
expect 409 "a second open loan on the tractor is refused"

call POST "/loans/${LOAN_ID}/emi" "{\"emiMonth\":\"${THIS_MONTH}\",\"paidOn\":\"${TODAY}\",\"amount\":25000,\"lateFee\":500,\"mode\":\"ONLINE\"}"
expect 201 "EMI paid with a late fee"
call POST "/loans/${LOAN_ID}/emi" "{\"emiMonth\":\"${THIS_MONTH}\",\"paidOn\":\"${TODAY}\",\"amount\":25000,\"mode\":\"ONLINE\"}"
expect 409 "the same month cannot be paid twice"

NEXT_MONTH="$(python3 -c "y, m = map(int, '${THIS_MONTH}'.split('-')); y, m = (y + 1, 1) if m == 12 else (y, m + 1); print(f'{y}-{m:02d}')")"
call POST "/loans/${LOAN_ID}/emi" "{\"emiMonth\":\"${NEXT_MONTH}\",\"paidOn\":\"${TODAY}\",\"amount\":25000,\"mode\":\"ONLINE\"}"
expect 201 "last EMI paid"
[[ "$(echo "$BODY" | jq -r .loan.closedReason)" == "PAID_OFF" ]] && echo "  ok: loan closed as paid off" || { echo "  FAIL: loan not closed"; FAILURES=$((FAILURES + 1)); }
LAST_EXPENSE="$(echo "$BODY" | jq .expenseId)"

call DELETE "/loans/${LOAN_ID}/payments/${LAST_EXPENSE}"
expect 200 "last EMI reversed"
[[ "$(echo "$BODY" | jq -r .closedReason)" == "null" ]] && echo "  ok: loan open again" || { echo "  FAIL: loan still closed"; FAILURES=$((FAILURES + 1)); }

call GET "/emi/due?days=45"
expect 200 "EMI due list"

finish
