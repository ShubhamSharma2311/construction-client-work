import { type SubmitEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { readIdParam } from "../../lib/addressFilters.ts";
import { todayIso } from "../../lib/dates.ts";
import { formatRupees, rupeesToPaise } from "../../lib/money.ts";
import { PAY_MODE_OPTIONS, type PayMode } from "../../lib/payModes.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { MonthField } from "../../ui/MonthField.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { filterOptions, useDrivers } from "../masters/useMasters.ts";
import { useSettings } from "../settings/useSettings.ts";
import { driverStanding } from "./driverText.ts";
import styles from "./NewDriverPaymentPage.module.css";
import { usePayBonus, usePayDriver } from "./useDriver.ts";

type Kind = "ADVANCE" | "SALARY" | "BONUS";

const KINDS = [
  { value: "ADVANCE" as const, label: "Advance" },
  { value: "SALARY" as const, label: "Salary" },
  { value: "BONUS" as const, label: "Bonus" },
];

const EXPLAIN: Record<Kind, string> = {
  ADVANCE: "Money given ahead of salary; it comes off what the driver has earned.",
  SALARY: "Salary paid out of what the driver has earned.",
  BONUS: "Extra money, earned and paid at once.",
};

interface Values {
  driverId: string;
  kind: Kind;
  paidOn: string;
  amount: string;
  mode: PayMode;
  forMonth: string;
  notes: string;
}

type Problems = Partial<Record<keyof Values, string>>;

export function checkDriverPayment(values: Values, today: string): Problems {
  return {
    ...(values.driverId ? {} : { driverId: "Pick the driver" }),
    ...((rupeesToPaise(values.amount) ?? 0) > 0 ? {} : { amount: "Enter the amount paid" }),
    ...(values.kind === "BONUS" && values.notes.trim() === ""
      ? { notes: "Say what the bonus is for" }
      : {}),
    ...(values.kind === "SALARY" && values.forMonth > today.slice(0, 7)
      ? { forMonth: "Salary can only be for a month that has started" }
      : {}),
  };
}

export function NewDriverPaymentPage() {
  const [params] = useSearchParams();
  const today = todayIso(new Date());
  const [values, setValues] = useState<Values>({
    driverId: readIdParam(params, "driver"),
    kind: "ADVANCE",
    paidOn: today,
    amount: "",
    mode: "CASH",
    forMonth: "",
    notes: "",
  });
  const [tried, setTried] = useState(false);
  const drivers = useDrivers();
  const settings = useSettings();
  const { key, renew } = useIdempotencyKey();
  const pay = usePayDriver();
  const bonus = usePayBonus();
  const saving = values.kind === "BONUS" ? bonus : pay;
  // Switching the kind mid-save must not free the button while the other save is on its way.
  const busy = pay.isPending || bonus.isPending;
  const toast = useToast();
  const navigate = useNavigate();
  const name =
    drivers.data?.find((driver) => String(driver.id) === values.driverId)?.name ?? "the driver";
  const set = (patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }));
  };
  // Checked live once a save was tried, so each mark clears as soon as it is fixed.
  const problems = tried ? checkDriverPayment(values, today) : {};
  const server = fieldErrors(saving.error);
  const problemOf = (field: keyof Values) =>
    problems[field] ?? server[field] ?? (field === "notes" ? server["note"] : undefined);
  const startYear = Number((settings.data?.businessStartDate ?? today).slice(0, 4));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(checkDriverPayment(values, today)).length > 0) return;
    const driverId = Number(values.driverId);
    const done = {
      onSuccess: (result: { balancePaise: number }) => {
        toast(
          `${formatRupees(rupeesToPaise(values.amount) ?? 0)} paid. ${driverStanding(name, result.balancePaise).text}.`,
        );
        void navigate(`/drivers/${values.driverId}`);
      },
      onError: (error: unknown) => {
        renewAfterMismatch(error, renew);
      },
    };
    const notes = values.notes.trim();
    if (values.kind === "BONUS") {
      bonus.mutate(
        {
          driverId,
          body: { paidOn: values.paidOn, amount: values.amount, mode: values.mode, note: notes },
          key,
        },
        done,
      );
      return;
    }
    const body = {
      type: values.kind,
      paidOn: values.paidOn,
      amount: values.amount,
      mode: values.mode,
      ...(values.kind === "SALARY" && values.forMonth ? { forMonth: values.forMonth } : {}),
      ...(notes ? { notes } : {}),
    };
    pay.mutate({ driverId, body, key }, done);
  };

  return (
    <>
      <PageHeader title="Driver payment" />
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormError
          error={saving.error}
          shownFields={["paidOn", "amount", "mode", "forMonth", "notes", "note"]}
        />
        <SelectField
          label="Driver"
          placeholder="Choose the driver"
          value={values.driverId}
          // Drivers who have left are still listed: what they are owed is paid after leaving.
          options={filterOptions(drivers.data, (driver) => driver.name)}
          error={problemOf("driverId")}
          onChange={(driverId) => {
            set({ driverId });
          }}
        />
        <Choice
          label="What it is"
          value={values.kind}
          options={KINDS}
          onChange={(kind) => {
            set({ kind });
          }}
        />
        <p className={styles.explain}>{EXPLAIN[values.kind]}</p>
        <DateField
          label="Paid on"
          value={values.paidOn}
          min={settings.data?.businessStartDate}
          max={today}
          error={problemOf("paidOn")}
          onChange={(paidOn) => {
            set({ paidOn });
          }}
        />
        <MoneyField
          label="Amount"
          large
          value={values.amount}
          error={problemOf("amount")}
          onChange={(amount) => {
            set({ amount });
          }}
        />
        <Choice
          label="Paid by"
          value={values.mode}
          options={PAY_MODE_OPTIONS}
          onChange={(mode) => {
            set({ mode });
          }}
        />
        {values.kind === "SALARY" ? (
          <MonthField
            label="Salary for (if one month)"
            value={values.forMonth}
            fromYear={startYear}
            toYear={Number(today.slice(0, 4))}
            error={problemOf("forMonth")}
            onChange={(forMonth) => {
              set({ forMonth });
            }}
          />
        ) : null}
        <TextField
          label={values.kind === "BONUS" ? "What it is for" : "Note"}
          maxLength={500}
          value={values.notes}
          error={problemOf("notes")}
          onChange={(event) => {
            set({ notes: event.target.value });
          }}
        />
        <Button type="submit" block disabled={busy}>
          {busy ? "Saving…" : "Save payment"}
        </Button>
      </form>
    </>
  );
}
