import { type SubmitEvent, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import type { IsoDate } from "../../lib/dates.ts";
import { Button } from "../../ui/Button.tsx";
import { Choice } from "../../ui/Choice.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { SetupHint } from "../masters/SetupHint.tsx";
import { pickerOptions, useDrivers, useLabourers, useTractors } from "../masters/useMasters.ts";
import { EXPENSE_CATEGORY_LABELS } from "./categories.ts";
import styles from "./ExpenseForm.module.css";
import {
  checkExpense,
  type EnteredCategory,
  type ExpenseValues,
  isLitresInput,
  ratePerLitre,
  showsReference,
} from "./expenseValues.ts";
import { PAY_MODE_OPTIONS } from "../../lib/payModes.ts";

// Fields this form can show, by the API's names; problems with anything else go in the notice.
const EXPENSE_FIELDS = [
  "spentOn",
  "amount",
  "mode",
  "reference",
  "notes",
  "labourerId",
  "tractorId",
  "driverId",
  "litres",
  "hourMeter",
  "periodFrom",
  "periodTo",
] as const;

const NOTE_LABELS: Record<EnteredCategory, string> = {
  LABOUR: "Note",
  ROYALTY: "Note",
  POLICE: "Paid to and why",
  OTHER: "What it was for",
  EMERGENCY: "What happened",
  TRACTOR_SERVICE: "Work done",
  DIESEL: "Note",
};

export interface ExpenseFormProps {
  initial: ExpenseValues;
  /** Kinds to choose between; one kind means the entry is already that kind. */
  categories: readonly EnteredCategory[];
  startDate: IsoDate;
  today: IsoDate;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: ExpenseValues) => void;
}

export function ExpenseForm({
  initial,
  categories,
  startDate,
  today,
  submitLabel,
  pending,
  error,
  onSubmit,
}: ExpenseFormProps) {
  const [values, setValues] = useState(initial);
  // Checked live once a save was tried, so each mark clears as soon as it is fixed.
  const [tried, setTried] = useState(false);
  const problems = tried ? checkExpense(values) : {};
  const server = fieldErrors(error);
  const problemOf = (field: keyof ExpenseValues) => problems[field] ?? server[field];
  const set = (patch: Partial<ExpenseValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };
  const tractors = useTractors();
  const drivers = useDrivers();
  const labourers = useLabourers();
  const labourerOptions = pickerOptions(labourers.data, values.labourerId, (item) => item.name);
  const { category } = values;
  const usesTractor =
    category === "DIESEL" || category === "TRACTOR_SERVICE" || category === "EMERGENCY";
  const usesDriver = category === "DIESEL" || category === "EMERGENCY";
  const optionalMachine = category === "EMERGENCY";
  const rate = category === "DIESEL" ? ratePerLitre(values.amount, values.litres) : null;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(checkExpense(values)).length === 0) onSubmit(values);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <FormError error={error} shownFields={EXPENSE_FIELDS} />
      {Object.keys(problems).length > 0 ? (
        <ErrorNotice>Some details are missing. See the marked fields.</ErrorNotice>
      ) : null}
      {categories.length > 1 ? (
        <SelectField
          label="Kind of expense"
          value={category}
          options={categories.map((value) => ({ value, label: EXPENSE_CATEGORY_LABELS[value] }))}
          onChange={(next) => {
            const picked = categories.find((candidate) => candidate === next);
            if (picked) set({ category: picked });
          }}
        />
      ) : null}
      <DateField
        label="Date"
        value={values.spentOn}
        min={startDate}
        max={today}
        error={problemOf("spentOn")}
        onChange={(spentOn) => {
          set({ spentOn });
        }}
      />

      {category === "LABOUR" ? (
        <SelectField
          label="Paid to"
          placeholder="Choose who was paid"
          value={values.labourerId}
          options={labourerOptions}
          error={problemOf("labourerId")}
          hint={
            labourers.data && labourerOptions.length === 0 ? (
              <SetupHint what="labourers" />
            ) : undefined
          }
          onChange={(labourerId) => {
            set({ labourerId });
          }}
        />
      ) : null}

      {usesTractor ? (
        <div className={styles.pair}>
          <SelectField
            label={optionalMachine ? "Tractor (if any)" : "Tractor"}
            placeholder={optionalMachine ? "None" : "Choose the tractor"}
            value={values.tractorId}
            options={pickerOptions(tractors.data, values.tractorId, (item) => item.regNumber)}
            error={problemOf("tractorId")}
            onChange={(tractorId) => {
              const tractor = tractors.data?.find(
                (candidate) => String(candidate.id) === tractorId,
              );
              // Diesel goes into a tractor its usual driver runs; fill that driver in.
              const usual =
                category === "DIESEL" && tractor?.defaultDriver
                  ? String(tractor.defaultDriver.id)
                  : null;
              set({ tractorId, ...(usual ? { driverId: usual } : {}) });
            }}
          />
          {usesDriver ? (
            <SelectField
              label={optionalMachine ? "Driver (if any)" : "Driver"}
              placeholder={optionalMachine ? "None" : "Choose the driver"}
              value={values.driverId}
              options={pickerOptions(drivers.data, values.driverId, (item) => item.name)}
              error={problemOf("driverId")}
              onChange={(driverId) => {
                set({ driverId });
              }}
            />
          ) : null}
        </div>
      ) : null}

      {category === "DIESEL" ? (
        <TextField
          label="Litres"
          inputMode="decimal"
          autoComplete="off"
          value={values.litres}
          error={problemOf("litres")}
          onChange={(event) => {
            if (isLitresInput(event.target.value)) set({ litres: event.target.value });
          }}
        />
      ) : null}

      <MoneyField
        label="Amount paid"
        large
        value={values.amount}
        error={problemOf("amount")}
        hint={rate ?? undefined}
        onChange={(amount) => {
          set({ amount });
        }}
      />
      <Choice
        label="Paid by"
        value={values.mode}
        options={PAY_MODE_OPTIONS}
        error={problemOf("mode")}
        onChange={(mode) => {
          set({ mode });
        }}
      />

      {category === "TRACTOR_SERVICE" ? (
        <TextField
          label="Hour meter (if read)"
          inputMode="numeric"
          value={values.hourMeter}
          error={problemOf("hourMeter")}
          onChange={(event) => {
            if (/^\d{0,6}$/.test(event.target.value)) set({ hourMeter: event.target.value });
          }}
        />
      ) : null}

      {category === "ROYALTY" ? (
        <div className={styles.pair}>
          <DateField
            label="Period from (if any)"
            value={values.periodFrom}
            max={today}
            error={problemOf("periodFrom")}
            onChange={(periodFrom) => {
              set({ periodFrom });
            }}
          />
          <DateField
            label="Period to"
            value={values.periodTo}
            max={today}
            error={problemOf("periodTo")}
            onChange={(periodTo) => {
              set({ periodTo });
            }}
          />
        </div>
      ) : null}

      {showsReference(values) ? (
        <TextField
          label={category === "ROYALTY" ? "Receipt number" : "UPI or bank reference"}
          hint="Optional"
          maxLength={100}
          value={values.reference}
          error={problemOf("reference")}
          onChange={(event) => {
            set({ reference: event.target.value });
          }}
        />
      ) : null}

      <TextField
        label={NOTE_LABELS[category]}
        maxLength={500}
        value={values.notes}
        error={problemOf("notes")}
        onChange={(event) => {
          set({ notes: event.target.value });
        }}
      />

      <Button type="submit" block disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
