import { type SubmitEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { parseId } from "../../lib/ids.ts";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees, rupeesToPaise } from "../../lib/money.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { CustomerPicker, type PickedCustomer } from "../customers/CustomerPicker.tsx";
import { useCustomer } from "../customers/useCustomers.ts";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { balanceText } from "../trips/balanceText.ts";
import styles from "./NewPaymentPage.module.css";
import { checkPayment, type PaymentFormValues, paymentBody, shareOver } from "./paymentForm.ts";
import { useRecordPayment, useUnpaidTrips } from "./usePayments.ts";
import { PAY_MODE_OPTIONS } from "../../lib/payModes.ts";

export function NewPaymentPage() {
  const settings = useSettings();
  const [params] = useSearchParams();
  const writeOff = params.get("kind") === "writeoff";
  const customerId = parseId(params.get("customer"));
  const title = writeOff ? "Write off" : "Money from customer";

  if (settings.data === null) {
    return (
      <>
        <PageHeader title={title} />
        <SetupPrompt />
      </>
    );
  }
  if (settings.isError) {
    return (
      <>
        <PageHeader title={title} />
        <LoadError error={settings.error} onRetry={() => void settings.refetch()} />
      </>
    );
  }
  if (!settings.data) return <PageHeader title={title} />;
  return (
    <>
      <PageHeader title={title} />
      {customerId === null ? (
        <PaymentForm
          startDate={settings.data.businessStartDate}
          customer={null}
          writeOff={writeOff}
        />
      ) : (
        <WithCustomer
          id={customerId}
          startDate={settings.data.businessStartDate}
          writeOff={writeOff}
        />
      )}
    </>
  );
}

/** Opened from a customer's account: the customer is already chosen. */
function WithCustomer({
  id,
  startDate,
  writeOff,
}: {
  id: number;
  startDate: IsoDate;
  writeOff: boolean;
}) {
  const customer = useCustomer(id);
  if (customer.isPending) return <Loading what="the customer" />;
  // A stale or wrong link still lets the entry be made; the customer is picked by hand.
  return <PaymentForm startDate={startDate} customer={customer.data ?? null} writeOff={writeOff} />;
}

// Fields this form shows, by the API's names; problems with anything else go in the notice.
const PAYMENT_FIELDS = ["paidOn", "amount", "mode", "reference", "notes"] as const;

const KINDS = [
  { value: "PAYMENT" as const, label: "Money received" },
  { value: "WRITE_OFF" as const, label: "Write off" },
];
const ALLOCATIONS = [
  { value: "AUTO" as const, label: "Oldest dues first" },
  { value: "MANUAL" as const, label: "Choose trips" },
];

function PaymentForm({
  startDate,
  customer,
  writeOff,
}: {
  startDate: IsoDate;
  customer: PickedCustomer | null;
  writeOff: boolean;
}) {
  const today = todayIso(new Date());
  const [values, setValues] = useState<PaymentFormValues>({
    customer,
    kind: writeOff ? "WRITE_OFF" : "PAYMENT",
    paidOn: today,
    amount: "",
    mode: "CASH",
    reference: "",
    notes: "",
    allocation: "AUTO",
    chosen: [],
  });
  const unpaid = useUnpaidTrips(values.customer?.id ?? null);
  // Checked live once a save was tried, so each mark clears as soon as it is fixed.
  const [tried, setTried] = useState(false);
  const problems = tried ? checkPayment(values, unpaid.data ?? []) : {};
  const { key, renew } = useIdempotencyKey();
  const record = useRecordPayment();
  const toast = useToast();
  const navigate = useNavigate();
  const serverProblems = fieldErrors(record.error);
  const problemOf = (field: string) => problems[field] ?? serverProblems[field];
  const set = (patch: Partial<PaymentFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(checkPayment(values, unpaid.data ?? [])).length > 0 || !values.customer) return;
    const name = values.customer.name;
    record.mutate(
      { customerId: values.customer.id, body: paymentBody(values, unpaid.data ?? []), key },
      {
        onSuccess: ({ payment, customerBalance }) => {
          const saved = payment.kind === "WRITE_OFF" ? "Write-off saved." : "Payment saved.";
          const credit =
            payment.unallocatedPaise > 0
              ? ` ${formatRupees(payment.unallocatedPaise)} kept as credit.`
              : "";
          toast(`${saved}${credit} ${balanceText(name, customerBalance)}`);
          void navigate(`/dues/${String(payment.customer.id)}`);
        },
        onError: (error) => {
          renewAfterMismatch(error, renew);
        },
      },
    );
  };

  const isPayment = values.kind === "PAYMENT";
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <FormError error={record.error} shownFields={PAYMENT_FIELDS} />
      {Object.keys(problems).length > 0 ? (
        <ErrorNotice>Some details are missing. See the marked fields.</ErrorNotice>
      ) : null}
      <Choice
        label="What happened"
        value={values.kind}
        options={KINDS}
        onChange={(kind) => {
          set({ kind });
        }}
      />
      {isPayment ? null : (
        <p className={styles.explain}>
          Money you agree not to collect, such as a discount. It lowers what the customer owes but
          is not counted as cash or online.
        </p>
      )}
      <CustomerPicker
        value={values.customer}
        error={problemOf("customer")}
        onChange={(picked) => {
          set({ customer: picked, chosen: [] });
        }}
      />
      <DateField
        label="Date"
        value={values.paidOn}
        min={startDate}
        max={today}
        error={problemOf("paidOn")}
        onChange={(paidOn) => {
          set({ paidOn });
        }}
      />
      <MoneyField
        label={isPayment ? "Amount received" : "Amount written off"}
        large
        value={values.amount}
        error={problemOf("amount")}
        onChange={(amount) => {
          set({ amount });
        }}
      />
      {isPayment ? (
        <Choice
          label="Received as"
          value={values.mode}
          options={PAY_MODE_OPTIONS}
          error={problemOf("mode")}
          onChange={(mode) => {
            set({ mode });
          }}
        />
      ) : null}
      {isPayment && values.mode === "ONLINE" ? (
        <TextField
          label="UPI or bank reference"
          hint="Optional. The same reference cannot be entered twice."
          maxLength={100}
          value={values.reference}
          error={problemOf("reference")}
          onChange={(event) => {
            set({ reference: event.target.value });
          }}
        />
      ) : null}
      <TextField
        label={isPayment ? "Note" : "Reason"}
        maxLength={500}
        value={values.notes}
        error={problemOf("notes")}
        onChange={(event) => {
          set({ notes: event.target.value });
        }}
      />
      {values.customer ? (
        <>
          <Choice
            label="What it pays"
            value={values.allocation}
            options={ALLOCATIONS}
            error={problemOf("allocation")}
            onChange={(allocation) => {
              set({ allocation });
            }}
          />
          {values.allocation === "MANUAL" ? (
            <ChooseTrips
              values={values}
              onChange={(chosen) => {
                set({ chosen });
              }}
              unpaid={unpaid}
              today={today}
            />
          ) : null}
        </>
      ) : null}
      <Button type="submit" block disabled={record.isPending}>
        {record.isPending ? "Saving…" : isPayment ? "Save payment" : "Save write-off"}
      </Button>
    </form>
  );
}

function ChooseTrips({
  values,
  unpaid,
  today,
  onChange,
}: {
  values: PaymentFormValues;
  unpaid: ReturnType<typeof useUnpaidTrips>;
  today: IsoDate;
  onChange: (chosen: number[]) => void;
}) {
  if (unpaid.isPending) return <Loading what="unpaid trips" />;
  if (unpaid.isError)
    return (
      <ErrorNotice>
        Could not load the unpaid trips. Use oldest dues first, or try again.
      </ErrorNotice>
    );
  if (unpaid.data.length === 0)
    return <p className={styles.explain}>Nothing is due. The money will be kept as credit.</p>;
  const { shares, leftPaise } = shareOver(
    rupeesToPaise(values.amount) ?? 0,
    values.chosen,
    unpaid.data,
  );
  const shareOf = (id: number) => shares.find((share) => share.trip.id === id)?.paise;

  return (
    <fieldset className={styles.trips}>
      <legend className={styles.tripsLegend}>Tick the trips it pays, in order</legend>
      {unpaid.data.map((trip) => {
        const ticked = values.chosen.includes(trip.id);
        const share = shareOf(trip.id);
        return (
          <label key={trip.id} className={styles.trip}>
            <input
              type="checkbox"
              checked={ticked}
              onChange={() => {
                onChange(
                  ticked
                    ? values.chosen.filter((id) => id !== trip.id)
                    : [...values.chosen, trip.id],
                );
              }}
            />
            <span className={styles.tripText}>
              {trip.kind === "OPENING_BALANCE"
                ? "Old register balance"
                : `Trip on ${formatDate(trip.tripDate, today)}`}
              <small>{formatRupees(trip.duePaise)} due</small>
            </span>
            <span className={styles.tripShare}>
              {share === undefined ? "" : `pays ${formatRupees(share)}`}
            </span>
          </label>
        );
      })}
      {values.chosen.length > 0 && leftPaise > 0 && values.kind === "PAYMENT" ? (
        <p className={styles.explain}>
          {formatRupees(leftPaise)} is more than the ticked trips owe and will be kept as credit.
        </p>
      ) : null}
    </fieldset>
  );
}
