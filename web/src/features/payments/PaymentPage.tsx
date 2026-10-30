import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, formatFullDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import styles from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink } from "../../ui/Register.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { Tag } from "../../ui/Tag.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { balanceText } from "../trips/balanceText.ts";
import {
  type Payment,
  type PaymentChanges,
  useDeletePayment,
  usePayment,
  useUpdatePayment,
} from "./usePayments.ts";

export function PaymentPage({ id }: { id: number }) {
  const payment = usePayment(id);
  if (payment.isError)
    return <LoadError error={payment.error} onRetry={() => void payment.refetch()} />;
  if (!payment.data) return <Loading what="the payment" />;
  return <PaymentDetails payment={payment.data} />;
}

function PaymentDetails({ payment }: { payment: Payment }) {
  const today = todayIso(new Date());
  const writeOff = payment.kind === "WRITE_OFF";
  return (
    <>
      <PageHeader
        title={writeOff ? "Write-off" : "Payment received"}
        actions={payment.deletedAt ? <Tag tone="quiet">Deleted</Tag> : null}
      />
      <DetailList>
        <Detail label="Customer">
          <Link to={`/dues/${String(payment.customer.id)}`}>{payment.customer.name}</Link>
        </Detail>
        <Detail label="Date">{formatFullDate(payment.paidOn)}</Detail>
        <Detail label="Amount">
          <Money paise={payment.amountPaise} tone={writeOff ? "plain" : "received"} />
        </Detail>
        {writeOff ? null : (
          <Detail label="Received as">{payment.mode === "ONLINE" ? "Online" : "Cash"}</Detail>
        )}
        {payment.reference ? <Detail label="Reference">{payment.reference}</Detail> : null}
        {payment.notes ? (
          <Detail label={writeOff ? "Reason" : "Note"}>{payment.notes}</Detail>
        ) : null}
        {payment.unallocatedPaise > 0 ? (
          <Detail label="Kept as credit">
            <Money paise={payment.unallocatedPaise} tone="received" />
          </Detail>
        ) : null}
      </DetailList>
      {payment.allocations.length > 0 ? (
        <Register label="What it paid">
          {payment.allocations.map((line) => (
            <RegisterLink
              key={line.tripId}
              to={`/trips/${String(line.tripId)}`}
              label={
                line.tripKind === "OPENING_BALANCE"
                  ? "Old register balance"
                  : `Trip on ${formatDate(line.tripDate, today)}`
              }
              amount={<Money paise={line.amountPaise} tone="received" />}
            />
          ))}
        </Register>
      ) : null}
      {payment.deletedAt ? null : <PaymentActions payment={payment} />}
    </>
  );
}

function PaymentActions({ payment }: { payment: Payment }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeletePayment(payment.id);
  const toast = useToast();
  const navigate = useNavigate();
  const paid = payment.allocations.length > 0;

  return (
    <div className={styles.actions}>
      <Button
        onClick={() => {
          setEditing(true);
        }}
      >
        Edit details
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          setDeleting(true);
        }}
      >
        Delete
      </Button>
      <EditPayment
        payment={payment}
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this entry?"
        confirmLabel="Delete entry"
        busy={remove.isPending}
        error={remove.isError ? saveErrorMessage(remove.error) : null}
        onClose={() => {
          setDeleting(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove.mutate(undefined, {
            onSuccess: (result) => {
              toast(`Entry deleted. ${balanceText(payment.customer.name, result.customerBalance)}`);
              void navigate(`/dues/${String(payment.customer.id)}`);
            },
          });
        }}
      >
        <p className={styles.text}>
          {paid
            ? `The ${formatRupees(payment.allocatedPaise)} it paid goes back onto those trips as due.`
            : "It paid no trips, so only the customer's credit changes."}
        </p>
      </ConfirmDialog>
    </div>
  );
}

const MODES = [
  { value: "CASH" as const, label: "Cash" },
  { value: "ONLINE" as const, label: "Online" },
];

/** Date, mode, reference and note can change; a different amount is a new entry. */
function EditPayment({
  payment,
  open,
  onClose,
}: {
  payment: Payment;
  open: boolean;
  onClose: () => void;
}) {
  const [paidOn, setPaidOn] = useState(payment.paidOn);
  const [mode, setMode] = useState(payment.mode ?? "CASH");
  const [reference, setReference] = useState(payment.reference ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const update = useUpdatePayment(payment.id);
  const settings = useSettings();
  const toast = useToast();
  const errors = fieldErrors(update.error);
  const writeOff = payment.kind === "WRITE_OFF";
  // Money taken at a delivery is dated by its trip; the trip's date is changed instead.
  const atDelivery = payment.deliveryTripId !== null;

  const save = () => {
    const changes: PaymentChanges = {};
    if (paidOn !== payment.paidOn) changes.paidOn = paidOn;
    if (!writeOff && mode !== payment.mode) changes.mode = mode;
    if (reference.trim() !== (payment.reference ?? "")) changes.reference = reference.trim();
    if (notes.trim() !== (payment.notes ?? "")) changes.notes = notes.trim();
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate(changes, {
      onSuccess: () => {
        toast("Details saved.");
        onClose();
      },
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit details">
      <div className={sheetStyles.body}>
        <FormError error={update.error} shownFields={["paidOn", "reference", "notes"]} />
        {atDelivery ? (
          <p className={styles.text}>Taken at delivery, so it keeps the trip's date.</p>
        ) : (
          <DateField
            label="Date"
            value={paidOn}
            min={settings.data?.businessStartDate}
            max={todayIso(new Date())}
            error={errors["paidOn"]}
            onChange={setPaidOn}
          />
        )}
        {writeOff ? null : (
          <Choice label="Received as" value={mode} options={MODES} onChange={setMode} />
        )}
        {writeOff || mode !== "ONLINE" ? null : (
          <TextField
            label="UPI or bank reference"
            value={reference}
            error={errors["reference"]}
            onChange={(event) => {
              setReference(event.target.value);
            }}
          />
        )}
        <TextField
          label={writeOff ? "Reason" : "Note"}
          value={notes}
          error={errors["notes"]}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <Button block onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </Sheet>
  );
}
