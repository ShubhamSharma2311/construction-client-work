import { type SubmitEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { readIdParam } from "../../lib/addressFilters.ts";
import { todayIso } from "../../lib/dates.ts";
import { formatRupees, rupeesToPaise } from "../../lib/money.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { MonthField } from "../../ui/MonthField.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { pickerOptions, useDrivers } from "../masters/useMasters.ts";
import { driverStanding } from "./driverStanding.ts";
import styles from "./NewDriverPaymentPage.module.css";
import { usePayBonus, usePayDriver } from "./useDriver.ts";
import { PAY_MODE_OPTIONS } from "../../lib/payModes.ts";

type Kind = "ADVANCE" | "SALARY" | "BONUS";

const KINDS = [
  { value: "ADVANCE" as const, label: "Advance" },
  { value: "SALARY" as const, label: "Salary" },
  { value: "BONUS" as const, label: "Bonus" },
];

export function NewDriverPaymentPage() {
  const [params] = useSearchParams();
  const today = todayIso(new Date());
  const [driverId, setDriverId] = useState(readIdParam(params, "driver"));
  const [kind, setKind] = useState<Kind>("ADVANCE");
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"CASH" | "ONLINE">("CASH");
  const [forMonth, setForMonth] = useState("");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const drivers = useDrivers();
  const { key, renew } = useIdempotencyKey();
  const id = Number(driverId);
  // Both hooks are always called; only the one for the chosen kind is used.
  const pay = usePayDriver(id);
  const bonus = usePayBonus(id);
  const saving = kind === "BONUS" ? bonus : pay;
  const toast = useToast();
  const navigate = useNavigate();
  const name = drivers.data?.find((driver) => driver.id === id)?.name ?? "the driver";

  const problems = tried
    ? {
        ...(driverId ? {} : { driverId: "Pick the driver" }),
        ...((rupeesToPaise(amount) ?? 0) > 0 ? {} : { amount: "Enter the amount paid" }),
        ...(kind === "BONUS" && notes.trim() === "" ? { notes: "Say what the bonus is for" } : {}),
      }
    : {};
  const server = fieldErrors(saving.error);
  const problemOf = (field: "driverId" | "amount" | "notes" | "paidOn" | "forMonth") =>
    (problems as Record<string, string | undefined>)[field] ??
    server[field] ??
    (field === "notes" ? server["note"] : undefined);

  const done = (balancePaise: number) => {
    toast(
      `${formatRupees(rupeesToPaise(amount) ?? 0)} paid. ${driverStanding(name, balancePaise).text}.`,
    );
    void navigate(`/drivers/${driverId}`);
  };
  const onError = (error: unknown) => {
    renewAfterMismatch(error, renew);
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (
      !driverId ||
      (rupeesToPaise(amount) ?? 0) === 0 ||
      (kind === "BONUS" && notes.trim() === "")
    )
      return;
    if (kind === "BONUS") {
      bonus.mutate(
        { body: { paidOn, amount, mode, note: notes.trim() }, key },
        {
          onSuccess: (r) => {
            done(r.balancePaise);
          },
          onError,
        },
      );
      return;
    }
    const body = {
      type: kind,
      paidOn,
      amount,
      mode,
      ...(kind === "SALARY" && forMonth ? { forMonth } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    pay.mutate(
      { body, key },
      {
        onSuccess: (r) => {
          done(r.balancePaise);
        },
        onError,
      },
    );
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
          value={driverId}
          options={pickerOptions(drivers.data, driverId, (driver) => driver.name)}
          error={problemOf("driverId")}
          onChange={setDriverId}
        />
        <Choice label="What it is" value={kind} options={KINDS} onChange={setKind} />
        <p className={styles.explain}>
          {kind === "ADVANCE"
            ? "Money given ahead of salary; it comes off what the driver has earned."
            : kind === "SALARY"
              ? "Salary paid out of what the driver has earned."
              : "Extra money, earned and paid at once."}
        </p>
        <DateField
          label="Paid on"
          value={paidOn}
          max={today}
          error={problemOf("paidOn")}
          onChange={setPaidOn}
        />
        <MoneyField
          label="Amount"
          large
          value={amount}
          error={problemOf("amount")}
          onChange={setAmount}
        />
        <Choice label="Paid by" value={mode} options={PAY_MODE_OPTIONS} onChange={setMode} />
        {kind === "SALARY" ? (
          <MonthField
            label="Salary for (if one month)"
            value={forMonth}
            fromYear={Number(today.slice(0, 4)) - 2}
            toYear={Number(today.slice(0, 4))}
            error={problemOf("forMonth")}
            onChange={setForMonth}
          />
        ) : null}
        <TextField
          label={kind === "BONUS" ? "What it is for" : "Note"}
          maxLength={500}
          value={notes}
          error={problemOf("notes")}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <Button type="submit" block disabled={saving.isPending}>
          {saving.isPending ? "Saving…" : "Save payment"}
        </Button>
      </form>
    </>
  );
}
