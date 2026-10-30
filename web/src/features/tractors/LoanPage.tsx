import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { formatDate, formatFullDate, formatMonth, todayIso } from "../../lib/dates.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Tag } from "../../ui/Tag.tsx";
import { EMI_STATUS_LABELS, EMI_STATUS_TONES } from "./emiText.ts";
import { DeleteLoan, Foreclose, PayEmi, UndoClosing, UndoEmi } from "./LoanSheets.tsx";
import { type Loan, type ScheduleLine, useLoan } from "./useLoans.ts";

export function LoanPage({ id }: { id: number }) {
  const loan = useLoan(id);
  if (loan.isError) return <LoadError error={loan.error} onRetry={() => void loan.refetch()} />;
  if (!loan.data) return <Loading what="the loan" />;
  return <LoanDetails loan={loan.data} />;
}

type SheetName = "pay" | "foreclose" | "delete" | "undoClosing";

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function LoanDetails({ loan }: { loan: Loan }) {
  const today = todayIso(new Date());
  const [params, setParams] = useSearchParams();
  // "?pay=2026-10" arrives from an EMI-due line or the Tractor EMI entry: Pay EMI opens on it.
  const asked = params.get("pay");
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [undoing, setUndoing] = useState<ScheduleLine | null>(null);
  const close = () => {
    setSheet(null);
    // Replaced, not pushed, so Back leaves the loan instead of reopening the sheet.
    if (asked) setParams({}, { replace: true });
  };
  const open = loan.closedOn === null;
  const paid = loan.schedule.filter((line) => line.payment !== null);
  const opener = (name: SheetName) => () => {
    setSheet(name);
  };

  const columns: Column<ScheduleLine>[] = [
    { key: "number", header: "No.", cell: (line) => line.number, phone: "hidden", margin: true },
    { key: "month", header: "Month", cell: (line) => formatMonth(line.month), phone: "title" },
    {
      key: "due",
      header: "Due on",
      cell: (line) => formatDate(line.dueDate, today),
      phone: "hidden",
    },
    {
      key: "paid",
      header: "Paid",
      cell: (line) =>
        line.payment ? <Money paise={line.payment.amountPaise} tone="received" /> : "",
      phone: "amount",
      numeric: true,
    },
    {
      key: "status",
      header: "Status",
      cell: (line) => (
        <Tag tone={EMI_STATUS_TONES[line.status]}>{EMI_STATUS_LABELS[line.status]}</Tag>
      ),
      phone: "status",
    },
  ];

  return (
    <>
      <PageHeader
        title={`${loan.tractor.regNumber} loan`}
        actions={
          open ? null : (
            <Tag tone="quiet">
              {loan.closedReason === "FORECLOSED" ? "Closed early" : "Paid off"}
            </Tag>
          )
        }
      />
      <DetailList>
        <Detail label="Tractor">
          <Link to={`/tractors/${String(loan.tractor.id)}`}>{loan.tractor.regNumber}</Link>
        </Detail>
        <Detail label="Lender">{loan.lender}</Detail>
        <Detail label="EMI">
          <span>
            <Money paise={loan.emiPaise} /> on the {loan.emiDay}
            {ordinal(loan.emiDay)} of each month
          </span>
        </Detail>
        <Detail label="Runs">{`${formatMonth(loan.firstEmiMonth)} to ${formatMonth(loan.lastEmiMonth)}`}</Detail>
        <Detail label="Paid so far">
          <span>
            <Money paise={loan.paidPaise} tone="received" />, {loan.summary.paidCount} of{" "}
            {loan.totalInstallments} EMIs
          </span>
        </Detail>
        {loan.closedOn ? <Detail label="Closed on">{formatFullDate(loan.closedOn)}</Detail> : null}
        {loan.notes ? <Detail label="Note">{loan.notes}</Detail> : null}
      </DetailList>
      <div className={actions.actions}>
        {open ? (
          <>
            <Button onClick={opener("pay")}>Pay EMI</Button>
            <Button variant="secondary" onClick={opener("foreclose")}>
              Close loan early
            </Button>
          </>
        ) : null}
        {loan.foreclosure ? (
          <Button variant="secondary" onClick={opener("undoClosing")}>
            Undo closing
          </Button>
        ) : null}
        {paid.length === 0 && loan.foreclosure === null ? (
          <Button variant="secondary" onClick={opener("delete")}>
            Delete loan
          </Button>
        ) : null}
      </div>
      <EntryTable
        caption="EMI schedule"
        rows={loan.schedule}
        columns={columns}
        rowKey={(line) => line.number}
        // A paid month opens its expense; an unpaid one opens nothing (Pay EMI is above).
        rowLink={(line) => (line.payment ? `/expenses/${String(line.payment.expenseId)}` : null)}
        rowLabel={(line) => `${formatMonth(line.month)} EMI`}
        phoneMeta={(line) =>
          line.payment
            ? `Paid ${formatDate(line.payment.paidOn, today)}`
            : `Due ${formatDate(line.dueDate, today)}`
        }
        empty="No EMIs in this loan."
      />
      {/* Undo is rare and set apart from the schedule, so a tap there cannot do it by accident.
          It stays on a closed loan: a mistaken last EMI must be undoable too. */}
      {paid.length > 0 ? (
        <details>
          <summary className={actions.text}>Undo an EMI payment</summary>
          <div className={actions.actions}>
            {paid.map((line) => (
              <Button
                key={line.number}
                variant="secondary"
                aria-label={`Undo the ${formatMonth(line.month)} payment`}
                onClick={() => {
                  setUndoing(line);
                }}
              >
                {formatMonth(line.month)}
              </Button>
            ))}
          </div>
        </details>
      ) : null}
      {open && (sheet === "pay" || asked !== null) ? (
        <PayEmi key={asked ?? "next"} loan={loan} month={asked} onClose={close} />
      ) : null}
      {sheet === "foreclose" ? <Foreclose loan={loan} onClose={close} /> : null}
      {sheet === "delete" ? <DeleteLoan loan={loan} onClose={close} /> : null}
      {sheet === "undoClosing" ? <UndoClosing loan={loan} onClose={close} /> : null}
      {undoing ? (
        <UndoEmi
          loan={loan}
          line={undoing}
          onClose={() => {
            setUndoing(null);
          }}
        />
      ) : null}
    </>
  );
}
