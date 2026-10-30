import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, formatFullDate, formatMonth, todayIso } from "../../lib/dates.ts";
import { formatRupees, paiseToRupeeInput, rupeesToPaise } from "../../lib/money.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { Tag } from "../../ui/Tag.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { EMI_STATUS_LABELS, EMI_STATUS_TONES, nextUnpaid } from "./emiText.ts";
import {
  type Loan,
  type ScheduleLine,
  useDeleteLoan,
  useForeclose,
  useLoan,
  usePayEmi,
  useUndoEmi,
} from "./useLoans.ts";

const MODES = [
  { value: "CASH" as const, label: "Cash" },
  { value: "ONLINE" as const, label: "Online" },
];
type PayMode = (typeof MODES)[number]["value"];

export function LoanPage({ id }: { id: number }) {
  const loan = useLoan(id);
  if (loan.isError) return <LoadError error={loan.error} onRetry={() => void loan.refetch()} />;
  if (!loan.data) return <Loading what="the loan" />;
  return <LoanDetails loan={loan.data} />;
}

type SheetName = "pay" | "foreclose" | "delete";

function LoanDetails({ loan }: { loan: Loan }) {
  const today = todayIso(new Date());
  const [params, setParams] = useSearchParams();
  // "?pay=2026-10" arrives from an EMI-due line or an unpaid month: Pay EMI opens on it.
  const asked = params.get("pay");
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [undoing, setUndoing] = useState<ScheduleLine | null>(null);
  const close = () => {
    setSheet(null);
    if (asked) setParams({}, { replace: true });
  };
  const open = loan.closedOn === null;
  const paidAny = loan.schedule.some((line) => line.payment !== null);

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
      {open ? (
        <div className={actions.actions}>
          <Button
            onClick={() => {
              setSheet("pay");
            }}
          >
            Pay EMI
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSheet("foreclose");
            }}
          >
            Close loan early
          </Button>
          {paidAny ? null : (
            <Button
              variant="secondary"
              onClick={() => {
                setSheet("delete");
              }}
            >
              Delete loan
            </Button>
          )}
        </div>
      ) : null}
      <EntryTable
        caption="EMI schedule"
        rows={loan.schedule}
        columns={columns}
        rowKey={(line) => line.number}
        rowLink={(line) =>
          line.payment
            ? `/expenses/${String(line.payment.expenseId)}`
            : `/loans/${String(loan.id)}${open ? `?pay=${line.month}` : ""}`
        }
        rowLabel={(line) => `${formatMonth(line.month)} EMI`}
        phoneMeta={(line) =>
          line.payment
            ? `Paid ${formatDate(line.payment.paidOn, today)}`
            : `Due ${formatDate(line.dueDate, today)}`
        }
        empty="No EMIs in this loan."
      />
      {open && paidAny ? (
        <UndoList
          loan={loan}
          onPick={(line) => {
            setUndoing(line);
          }}
        />
      ) : null}
      {open && (sheet === "pay" || asked !== null) ? (
        <PayEmi key={asked ?? "next"} loan={loan} month={asked} onClose={close} />
      ) : null}
      {sheet === "foreclose" ? <Foreclose loan={loan} onClose={close} /> : null}
      {sheet === "delete" ? <DeleteLoan loan={loan} onClose={close} /> : null}
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

/** Undoing a payment is rare and separate from the schedule, so a tap there cannot do it by accident. */
function UndoList({ loan, onPick }: { loan: Loan; onPick: (line: ScheduleLine) => void }) {
  const paid = loan.schedule.filter((line) => line.payment !== null);
  return (
    <details>
      <summary className={actions.text}>Undo an EMI payment</summary>
      <div className={actions.actions}>
        {paid.map((line) => (
          <Button
            key={line.number}
            variant="secondary"
            onClick={() => {
              onPick(line);
            }}
          >
            {formatMonth(line.month)}
          </Button>
        ))}
      </div>
    </details>
  );
}

function PayEmi({
  loan,
  month,
  onClose,
}: {
  loan: Loan;
  month: string | null;
  onClose: () => void;
}) {
  const today = todayIso(new Date());
  const unpaid = loan.schedule.filter((line) => line.payment === null && line.status !== "CLOSED");
  const first = unpaid.find((line) => line.month === month) ?? nextUnpaid(loan.schedule);
  const [emiMonth, setEmiMonth] = useState(first?.month ?? "");
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(paiseToRupeeInput(loan.emiPaise));
  const [lateFee, setLateFee] = useState("");
  const [mode, setMode] = useState<PayMode>("ONLINE");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const { key, renew } = useIdempotencyKey();
  const pay = usePayEmi(loan.id);
  const settings = useSettings();
  const toast = useToast();
  const errors = fieldErrors(pay.error);

  return (
    <Sheet open onClose={onClose} title="Pay EMI">
      <div className={sheetStyles.body}>
        <FormError
          error={pay.error}
          shownFields={["emiMonth", "paidOn", "amount", "lateFee", "mode", "reference", "notes"]}
        />
        <SelectField
          label="Month"
          value={emiMonth}
          options={unpaid.map((line) => ({
            value: line.month,
            label: `${formatMonth(line.month)}, ${EMI_STATUS_LABELS[line.status].toLowerCase()}`,
          }))}
          error={errors["emiMonth"]}
          onChange={setEmiMonth}
        />
        <DateField
          label="Paid on"
          value={paidOn}
          min={settings.data?.businessStartDate}
          max={today}
          error={errors["paidOn"]}
          onChange={setPaidOn}
        />
        <MoneyField label="EMI paid" value={amount} error={errors["amount"]} onChange={setAmount} />
        <MoneyField
          label="Late fee (if any)"
          value={lateFee}
          error={errors["lateFee"]}
          onChange={setLateFee}
        />
        <Choice label="Paid by" value={mode} options={MODES} onChange={setMode} />
        {mode === "ONLINE" ? (
          <TextField
            label="Bank reference"
            hint="Optional"
            maxLength={100}
            value={reference}
            error={errors["reference"]}
            onChange={(event) => {
              setReference(event.target.value);
            }}
          />
        ) : null}
        <TextField
          label="Note"
          maxLength={500}
          value={notes}
          error={errors["notes"]}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <Button
          block
          disabled={pay.isPending || emiMonth === "" || amount === ""}
          onClick={() => {
            const body = {
              emiMonth,
              paidOn,
              amount,
              mode,
              ...(lateFee ? { lateFee } : {}),
              ...(mode === "ONLINE" && reference.trim() ? { reference: reference.trim() } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            };
            pay.mutate(
              { body, key },
              {
                onSuccess: (result) => {
                  const closed = result.loan.closedOn ? " The loan is now paid off." : "";
                  toast(
                    `${formatMonth(emiMonth)} EMI of ${formatRupees(result.loan.emiPaise)} paid.${closed}`,
                  );
                  for (const warning of result.warnings) toast(warning);
                  onClose();
                },
                onError: (error) => {
                  renewAfterMismatch(error, renew);
                },
              },
            );
          }}
        >
          {pay.isPending ? "Saving…" : "Save EMI payment"}
        </Button>
      </div>
    </Sheet>
  );
}

function Foreclose({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const today = todayIso(new Date());
  const [closedOn, setClosedOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PayMode>("ONLINE");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const { key, renew } = useIdempotencyKey();
  const foreclose = useForeclose(loan.id);
  const settings = useSettings();
  const toast = useToast();
  const errors = fieldErrors(foreclose.error);

  return (
    <Sheet open onClose={onClose} title="Close loan early">
      <div className={sheetStyles.body}>
        <p className={actions.text}>
          The amount the lender takes to close the loan now. EMIs not yet paid are then not due.
        </p>
        <FormError
          error={foreclose.error}
          shownFields={["closedOn", "amount", "mode", "reference", "notes"]}
        />
        <DateField
          label="Closed on"
          value={closedOn}
          min={settings.data?.businessStartDate}
          max={today}
          error={errors["closedOn"]}
          onChange={setClosedOn}
        />
        <MoneyField
          label="Amount paid to close it"
          large
          value={amount}
          error={errors["amount"]}
          onChange={setAmount}
        />
        <Choice label="Paid by" value={mode} options={MODES} onChange={setMode} />
        {mode === "ONLINE" ? (
          <TextField
            label="Bank reference"
            hint="Optional"
            maxLength={100}
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
            }}
          />
        ) : null}
        <TextField
          label="Note"
          maxLength={500}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <Button
          block
          disabled={foreclose.isPending || amount === ""}
          onClick={() => {
            const body = {
              closedOn,
              amount,
              mode,
              ...(mode === "ONLINE" && reference.trim() ? { reference: reference.trim() } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            };
            foreclose.mutate(
              { body, key },
              {
                onSuccess: () => {
                  toast(`Loan closed with ${formatRupees(rupeesToPaise(amount) ?? 0)}.`);
                  onClose();
                },
                onError: (error) => {
                  renewAfterMismatch(error, renew);
                },
              },
            );
          }}
        >
          {foreclose.isPending ? "Saving…" : "Close the loan"}
        </Button>
      </div>
    </Sheet>
  );
}

function UndoEmi({ loan, line, onClose }: { loan: Loan; line: ScheduleLine; onClose: () => void }) {
  const undo = useUndoEmi(loan.id);
  const toast = useToast();
  const payment = line.payment;
  if (!payment) return null;
  return (
    <ConfirmDialog
      open
      title={`Undo the ${formatMonth(line.month)} EMI?`}
      confirmLabel="Undo payment"
      busy={undo.isPending}
      error={undo.isError ? saveErrorMessage(undo.error) : null}
      onClose={onClose}
      onConfirm={() => {
        undo.mutate(payment.expenseId, {
          onSuccess: () => {
            toast(`${formatMonth(line.month)} EMI undone; it is due again.`);
            onClose();
          },
        });
      }}
    >
      <p className={actions.text}>
        The {formatRupees(payment.amountPaise)} paid on {formatFullDate(payment.paidOn)} is removed
        from the expenses, and the month shows as due again.
      </p>
    </ConfirmDialog>
  );
}

function DeleteLoan({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const remove = useDeleteLoan(loan.id);
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <ConfirmDialog
      open
      title="Delete this loan?"
      confirmLabel="Delete loan"
      busy={remove.isPending}
      error={remove.isError ? saveErrorMessage(remove.error) : null}
      onClose={onClose}
      onConfirm={() => {
        remove.mutate(undefined, {
          onSuccess: () => {
            toast("Loan deleted.");
            void navigate(`/tractors/${String(loan.tractor.id)}`);
          },
        });
      }}
    >
      <p className={actions.text}>For a loan entered by mistake. No EMI has been paid on it.</p>
    </ConfirmDialog>
  );
}
