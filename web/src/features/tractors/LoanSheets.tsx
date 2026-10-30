import { useState } from "react";
import { useNavigate } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatFullDate, formatMonth, todayIso } from "../../lib/dates.ts";
import { formatRupees, paiseToRupeeInput } from "../../lib/money.ts";
import { PAY_MODE_OPTIONS, type PayMode } from "../../lib/payModes.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { EMI_STATUS_LABELS } from "./emiText.ts";
import {
  type Loan,
  type ScheduleLine,
  useDeleteLoan,
  useForeclose,
  usePayEmi,
  useUndoEmi,
} from "./useLoans.ts";

// The sheets on a loan's page. Each is mounted only while open, so it starts fresh.

interface MovedMoney {
  mode: PayMode;
  reference: string;
  notes: string;
}

/** How the money went: the same three fields when paying an EMI and when closing early. */
function MovedMoneyFields({
  value,
  errors,
  onChange,
}: {
  value: MovedMoney;
  errors: Record<string, string>;
  onChange: (value: MovedMoney) => void;
}) {
  return (
    <>
      <Choice
        label="Paid by"
        value={value.mode}
        options={PAY_MODE_OPTIONS}
        error={errors["mode"]}
        onChange={(mode) => {
          onChange({ ...value, mode });
        }}
      />
      {value.mode === "ONLINE" ? (
        <TextField
          label="Bank reference"
          hint="Optional"
          maxLength={100}
          value={value.reference}
          error={errors["reference"]}
          onChange={(event) => {
            onChange({ ...value, reference: event.target.value });
          }}
        />
      ) : null}
      <TextField
        label="Note"
        maxLength={500}
        value={value.notes}
        error={errors["notes"]}
        onChange={(event) => {
          onChange({ ...value, notes: event.target.value });
        }}
      />
    </>
  );
}

/** Only what applies: a reference only for online money, a note only when written. */
function movedMoneyBody(value: MovedMoney) {
  const reference = value.mode === "ONLINE" ? value.reference.trim() : "";
  const notes = value.notes.trim();
  return { mode: value.mode, ...(reference ? { reference } : {}), ...(notes ? { notes } : {}) };
}

const ONLINE: MovedMoney = { mode: "ONLINE", reference: "", notes: "" };

export function PayEmi({
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
  const asked = unpaid.find((line) => line.month === month);
  const start = asked?.month ?? loan.summary.nextDue?.month ?? unpaid[0]?.month ?? "";
  const [emiMonth, setEmiMonth] = useState(start);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(paiseToRupeeInput(loan.emiPaise));
  const [lateFee, setLateFee] = useState("");
  const [moved, setMoved] = useState<MovedMoney>(ONLINE);
  const { key, renew } = useIdempotencyKey();
  const pay = usePayEmi(loan.id);
  const settings = useSettings();
  const toast = useToast();
  const errors = fieldErrors(pay.error);

  return (
    <Sheet open onClose={onClose} title="Pay EMI">
      <div className={sheetStyles.body}>
        {/* A link to a month already paid (an old EMI-due line) must not quietly pay another. */}
        {month !== null && asked === undefined ? (
          <ErrorNotice>
            {formatMonth(month)} is already paid or not part of this loan.
            {start ? ` Showing ${formatMonth(start)}, the next one due.` : ""}
          </ErrorNotice>
        ) : null}
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
        <MovedMoneyFields value={moved} errors={errors} onChange={setMoved} />
        <Button
          block
          disabled={pay.isPending || emiMonth === "" || amount === ""}
          onClick={() => {
            const body = {
              emiMonth,
              paidOn,
              amount,
              ...(lateFee ? { lateFee } : {}),
              ...movedMoneyBody(moved),
            };
            pay.mutate(
              { body, key },
              {
                onSuccess: (result) => {
                  // What was paid, which may differ from the EMI; the late fee is in it.
                  const paid = result.loan.schedule.find(
                    (line) => line.month === emiMonth,
                  )?.payment;
                  const closed = result.loan.closedOn ? " The loan is now paid off." : "";
                  toast(
                    `${formatMonth(emiMonth)} EMI paid${paid ? `: ${formatRupees(paid.amountPaise)}` : ""}.${closed}`,
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

export function Foreclose({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const today = todayIso(new Date());
  const [closedOn, setClosedOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [moved, setMoved] = useState<MovedMoney>(ONLINE);
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
        <MovedMoneyFields value={moved} errors={errors} onChange={setMoved} />
        <Button
          block
          disabled={foreclose.isPending || amount === ""}
          onClick={() => {
            foreclose.mutate(
              { body: { closedOn, amount, ...movedMoneyBody(moved) }, key },
              {
                onSuccess: (result) => {
                  const paid = result.loan.foreclosure;
                  toast(`Loan closed${paid ? ` with ${formatRupees(paid.amountPaise)}` : ""}.`);
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

export function UndoEmi({
  loan,
  line,
  onClose,
}: {
  loan: Loan;
  line: ScheduleLine;
  onClose: () => void;
}) {
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
        from the expenses, and the month shows as due again. A loan this payment paid off opens
        again.
      </p>
    </ConfirmDialog>
  );
}

export function UndoClosing({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const undo = useUndoEmi(loan.id);
  const toast = useToast();
  const closing = loan.foreclosure;
  if (!closing) return null;
  return (
    <ConfirmDialog
      open
      title="Undo closing this loan?"
      confirmLabel="Undo closing"
      busy={undo.isPending}
      error={undo.isError ? saveErrorMessage(undo.error) : null}
      onClose={onClose}
      onConfirm={() => {
        undo.mutate(closing.expenseId, {
          onSuccess: () => {
            toast("Closing undone; the loan is running again.");
            onClose();
          },
        });
      }}
    >
      <p className={actions.text}>
        The {formatRupees(closing.amountPaise)} paid on {formatFullDate(closing.paidOn)} to close it
        is removed, and the EMIs not paid are due again.
      </p>
    </ConfirmDialog>
  );
}

export function DeleteLoan({ loan, onClose }: { loan: Loan; onClose: () => void }) {
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
