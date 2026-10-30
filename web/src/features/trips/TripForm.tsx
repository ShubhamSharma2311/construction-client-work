import { type SubmitEvent, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import type { IsoDate } from "../../lib/dates.ts";
import { formatRupees, rupeesToPaise } from "../../lib/money.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { CustomerPicker } from "../customers/CustomerPicker.tsx";
import { SetupHint } from "../masters/SetupHint.tsx";
import { pickerOptions, useDrivers, useKhets, useTractors } from "../masters/useMasters.ts";
import styles from "./TripForm.module.css";
import {
  checkTrip,
  type PaymentType,
  type PaymentValues,
  SERVER_FIELDS,
  type TripValues,
} from "./tripForm.ts";
import { PAY_MODE_OPTIONS } from "../../lib/payModes.ts";

// Fields this form shows, by the API's names; problems with anything else go in the notice.
const TRIP_FIELDS = [
  "tripDate",
  "customerId",
  "driverId",
  "tractorId",
  "khetId",
  "amount",
  "quantityNote",
  "notes",
  "payment.paidAmount",
  "payment.mode",
  "payment.reference",
] as const;

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "ONLINE", label: "Online" },
  { value: "DUE", label: "Due" },
  { value: "PARTIAL", label: "Part paid" },
];

export interface TripFormProps {
  initial: TripValues;
  /** New trips record how they were paid; edits leave payments to the customer's account. */
  initialPayment: PaymentValues | null;
  startDate: IsoDate;
  today: IsoDate;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: TripValues, payment: PaymentValues | null) => void;
}

export function TripForm({
  initial,
  initialPayment,
  startDate,
  today,
  submitLabel,
  pending,
  error,
  onSubmit,
}: TripFormProps) {
  const [values, setValues] = useState(initial);
  const [payment, setPayment] = useState(initialPayment);
  // Checked live once a save was tried, so each mark clears as soon as it is fixed.
  const [tried, setTried] = useState(false);
  const problems = tried ? checkTrip(values, payment) : {};
  const drivers = useDrivers();
  const tractors = useTractors();
  const khets = useKhets();
  const khetOptions = pickerOptions(khets.data, values.khetId, (item) => item.name);

  const serverProblems = Object.fromEntries(
    Object.entries(fieldErrors(error)).map(([field, message]) => [
      SERVER_FIELDS[field] ?? field,
      message,
    ]),
  );
  const problemOf = (field: string) => problems[field] ?? serverProblems[field];
  const set = <K extends keyof TripValues>(field: K, value: TripValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const driver = drivers.data?.find((candidate) => String(candidate.id) === values.driverId);
  const usualTractor = driver?.defaultTractor;
  const onUsualTractor =
    usualTractor !== null &&
    usualTractor !== undefined &&
    String(usualTractor.id) === values.tractorId;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(checkTrip(values, payment)).length === 0) onSubmit(values, payment);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <FormError error={error} shownFields={TRIP_FIELDS} />
      {Object.keys(problems).length > 0 ? (
        <ErrorNotice>Some details are missing. See the marked fields.</ErrorNotice>
      ) : null}

      <DateField
        label="Date"
        value={values.tripDate}
        min={startDate}
        max={today}
        required
        error={problemOf("tripDate")}
        onChange={(next) => {
          set("tripDate", next);
        }}
      />
      <CustomerPicker
        value={values.customer}
        error={problemOf("customer")}
        onChange={(customer) => {
          set("customer", customer);
        }}
      />
      <div className={styles.pair}>
        <SelectField
          label="Driver"
          placeholder="Choose the driver"
          value={values.driverId}
          options={pickerOptions(drivers.data, values.driverId, (item) => item.name)}
          error={problemOf("driverId")}
          onChange={(driverId) => {
            const next = drivers.data?.find((candidate) => String(candidate.id) === driverId);
            setValues((current) => ({
              ...current,
              driverId,
              // Each driver has one usual tractor, so fill it in; a swap is still one tap away.
              tractorId: next?.defaultTractor ? String(next.defaultTractor.id) : current.tractorId,
            }));
          }}
        />
        <SelectField
          label="Tractor"
          placeholder="Choose the tractor"
          value={values.tractorId}
          options={pickerOptions(tractors.data, values.tractorId, (item) => item.regNumber)}
          error={problemOf("tractorId")}
          hint={
            driver && usualTractor
              ? onUsualTractor
                ? `${driver.name}'s usual tractor`
                : `${driver.name} usually drives ${usualTractor.regNumber}`
              : undefined
          }
          onChange={(tractorId) => {
            set("tractorId", tractorId);
          }}
        />
      </div>
      <SelectField
        label="Khet"
        placeholder="Where the sand came from"
        value={values.khetId}
        options={khetOptions}
        error={problemOf("khetId")}
        hint={khets.data && khetOptions.length === 0 ? <SetupHint what="khets" /> : undefined}
        onChange={(khetId) => {
          set("khetId", khetId);
        }}
      />
      <MoneyField
        label="Trip amount"
        large
        required
        value={values.amount}
        error={problemOf("amount")}
        onChange={(amount) => {
          set("amount", amount);
        }}
      />

      {payment ? (
        <PaymentFields
          payment={payment}
          amount={values.amount}
          problemOf={problemOf}
          onChange={setPayment}
        />
      ) : null}

      <details className={styles.more} open={initial.quantityNote !== "" || initial.notes !== ""}>
        <summary>Quantity or a note</summary>
        <div className={styles.moreFields}>
          <TextField
            label="Quantity"
            placeholder="e.g. 1 trolley"
            maxLength={50}
            value={values.quantityNote}
            error={problemOf("quantityNote")}
            onChange={(event) => {
              set("quantityNote", event.target.value);
            }}
          />
          <TextField
            label="Note"
            maxLength={500}
            value={values.notes}
            error={problemOf("notes")}
            onChange={(event) => {
              set("notes", event.target.value);
            }}
          />
        </div>
      </details>

      <Button type="submit" block disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
      {payment ? <DueNote amount={values.amount} payment={payment} /> : null}
    </form>
  );
}

function PaymentFields({
  payment,
  amount,
  problemOf,
  onChange,
}: {
  payment: PaymentValues;
  amount: string;
  problemOf: (field: string) => string | undefined;
  onChange: (payment: PaymentValues) => void;
}) {
  const online =
    payment.type === "ONLINE" || (payment.type === "PARTIAL" && payment.mode === "ONLINE");
  return (
    <>
      <Choice
        label="How it was paid"
        value={payment.type}
        options={PAYMENT_TYPES}
        error={problemOf("payment")}
        onChange={(type) => {
          onChange({ ...payment, type });
        }}
      />
      {payment.type === "PARTIAL" ? (
        <div className={styles.pair}>
          <MoneyField
            label="Paid now"
            value={payment.paidAmount}
            error={problemOf("paidAmount")}
            hint={amount ? `Out of ${formatRupees(rupeesToPaise(amount) ?? 0)}` : undefined}
            onChange={(paidAmount) => {
              onChange({ ...payment, paidAmount });
            }}
          />
          <Choice
            label="Paid by"
            value={payment.mode}
            options={PAY_MODE_OPTIONS}
            error={problemOf("mode")}
            onChange={(mode) => {
              onChange({ ...payment, mode });
            }}
          />
        </div>
      ) : null}
      {online ? (
        <TextField
          label="UPI or bank reference"
          hint="Optional. The same reference cannot be entered twice."
          maxLength={100}
          value={payment.reference}
          error={problemOf("reference")}
          onChange={(event) => {
            onChange({ ...payment, reference: event.target.value });
          }}
        />
      ) : null}
    </>
  );
}

/** What this trip adds to the customer's dues, said before saving rather than after. */
function DueNote({ amount, payment }: { amount: string; payment: PaymentValues }) {
  const total = rupeesToPaise(amount);
  if (total === null || total === 0) return null;
  let text: string;
  if (payment.type === "DUE")
    text = `All ${formatRupees(total)} will be added to the customer's dues.`;
  else if (payment.type === "PARTIAL") {
    const paid = rupeesToPaise(payment.paidAmount) ?? 0;
    if (paid === 0 || paid >= total) return null;
    text = `${formatRupees(total - paid)} will be left as due.`;
  } else text = `Paid in full, ${payment.type === "CASH" ? "in cash" : "online"}.`;
  return <p className={styles.dueNote}>{text}</p>;
}
