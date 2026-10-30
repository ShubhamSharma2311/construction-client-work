import { useState } from "react";
import { useNavigate } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatMonth, todayIso } from "../../lib/dates.ts";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { useTractors } from "../masters/useMasters.ts";
import { dueText } from "./emiText.ts";
import { TractorFields, type TractorValues } from "./TractorFields.tsx";
import styles from "./TractorsPage.module.css";
import { type LoanSummary, useEmiDue, useLoans } from "./useLoans.ts";
import { useCreateTractor } from "./useTractor.ts";

// The week ahead: enough warning to arrange the money for an EMI.
const DUE_WITHIN_DAYS = 7;

export function TractorsPage() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Tractors"
        actions={
          <>
            <ButtonLink to="/new/emi">Pay EMI</ButtonLink>
            <ButtonLink variant="secondary" to="/new/service">
              Tractor repair
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(true);
              }}
            >
              Add tractor
            </Button>
          </>
        }
      />
      <EmisDue />
      <h2 className={styles.subhead}>Tractors</h2>
      <TractorList />
      {adding ? (
        <AddTractor
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </>
  );
}

function EmisDue() {
  const due = useEmiDue(DUE_WITHIN_DAYS);
  const today = todayIso(new Date());
  if (due.isError) return <LoadError error={due.error} onRetry={() => void due.refetch()} />;
  if (!due.data) return <Loading what="EMIs due" />;
  return (
    <section className={styles.section} aria-label="EMIs due">
      <h2 className={styles.subhead}>EMIs due this week</h2>
      <Register label="EMIs due">
        {due.data.items.length === 0 ? (
          <RegisterRow label="Nothing due this week." />
        ) : (
          due.data.items.map((item) => (
            <RegisterLink
              key={`${String(item.loan.id)}-${item.month}`}
              to={`/loans/${String(item.loan.id)}?pay=${item.month}`}
              label={
                <span className={item.status === "OVERDUE" ? styles.late : undefined}>
                  {item.tractor.regNumber}, {formatMonth(item.month)}
                </span>
              }
              detail={`${item.loan.lender}, ${dueText(item.status, item.dueDate, item.daysLate, today)}`}
              amount={
                <Money paise={item.emiPaise} tone={item.status === "OVERDUE" ? "owed" : "plain"} />
              }
            />
          ))
        )}
      </Register>
    </section>
  );
}

function loanLine(loan: LoanSummary | undefined): string {
  if (!loan) return "No loan running";
  return `${loan.lender}: ${String(loan.summary.paidCount)} of ${String(loan.totalInstallments)} EMIs paid`;
}

function TractorList() {
  const tractors = useTractors();
  const loans = useLoans({ status: "open" });
  if (tractors.isError)
    return <LoadError error={tractors.error} onRetry={() => void tractors.refetch()} />;
  if (!tractors.data) return <Loading what="tractors" />;
  // Only one loan can be open per tractor at a time.
  const openLoanOf = (tractorId: number) =>
    loans.data?.find((loan) => loan.tractor.id === tractorId);

  return (
    <>
      {loans.isError ? (
        <LoadError error={loans.error} onRetry={() => void loans.refetch()} />
      ) : null}
      <Register label="Tractors">
        {tractors.data.length === 0 ? (
          <RegisterRow label="No tractors yet. Add the first one." />
        ) : (
          tractors.data.map((tractor) => (
            <RegisterLink
              key={tractor.id}
              to={`/tractors/${String(tractor.id)}`}
              label={
                tractor.isActive
                  ? `${tractor.regNumber}, ${tractor.label}`
                  : `${tractor.regNumber} (inactive)`
              }
              detail={[
                tractor.defaultDriver?.name,
                loans.data ? loanLine(openLoanOf(tractor.id)) : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          ))
        )}
      </Register>
    </>
  );
}

function AddTractor({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<TractorValues>({ regNumber: "", label: "" });
  const create = useCreateTractor();
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <Sheet open onClose={onClose} title="Add tractor">
      <div className={sheetStyles.body}>
        <FormError error={create.error} shownFields={["regNumber", "label"]} />
        <TractorFields values={values} errors={fieldErrors(create.error)} onChange={setValues} />
        <Button
          block
          disabled={
            create.isPending || values.regNumber.trim() === "" || values.label.trim() === ""
          }
          onClick={() => {
            create.mutate(
              { regNumber: values.regNumber.trim(), label: values.label.trim() },
              {
                onSuccess: (tractor) => {
                  toast(`${tractor.regNumber} added.`);
                  void navigate(`/tractors/${String(tractor.id)}`);
                },
              },
            );
          }}
        >
          {create.isPending ? "Adding…" : "Add tractor"}
        </Button>
      </div>
    </Sheet>
  );
}
