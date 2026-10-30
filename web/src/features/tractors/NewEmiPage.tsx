import { formatDate, formatMonth, todayIso } from "../../lib/dates.ts";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { Link } from "react-router";
import { useLoans } from "./useLoans.ts";

/** "Tractor EMI" from New entry: pick the loan, then pay on its page. */
export function NewEmiPage() {
  const loans = useLoans({ status: "open" });
  const today = todayIso(new Date());
  const running = loans.data ?? [];
  return (
    <>
      <PageHeader title="Tractor EMI" />
      {loans.isError ? (
        <LoadError error={loans.error} onRetry={() => void loans.refetch()} />
      ) : null}
      {loans.isPending ? <Loading what="loans" /> : null}
      {loans.data ? (
        <Register label="Loans running">
          {running.length === 0 ? (
            <RegisterRow
              label="No loan is running."
              detail={
                <>
                  Add one from the tractor&apos;s page in{" "}
                  <Link to="/tractors">Tractors and EMI</Link>.
                </>
              }
            />
          ) : (
            running.map((loan) => (
              <RegisterLink
                key={loan.id}
                to={`/loans/${String(loan.id)}${loan.summary.nextDue ? `?pay=${loan.summary.nextDue.month}` : ""}`}
                label={`${loan.tractor.regNumber}, ${loan.lender}`}
                detail={
                  loan.summary.nextDue
                    ? `Next: ${formatMonth(loan.summary.nextDue.month)}, due ${formatDate(loan.summary.nextDue.dueDate, today)}`
                    : "All EMIs paid"
                }
                amount={<Money paise={loan.emiPaise} />}
              />
            ))
          )}
        </Register>
      ) : null}
    </>
  );
}
