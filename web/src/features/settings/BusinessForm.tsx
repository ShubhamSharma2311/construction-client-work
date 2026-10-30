import { type SubmitEvent, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { useToast } from "../../app/Toast.tsx";
import { todayIso } from "../../lib/dates.ts";
import { paiseToRupeeInput } from "../../lib/money.ts";
import { Button } from "../../ui/Button.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { TextField } from "../../ui/TextField.tsx";
import styles from "./SettingsPage.module.css";
import { type Settings, useSaveSettings } from "./useSettings.ts";

/** The business name, the day the books start, and the money in hand that day. */
export function BusinessForm({ settings }: { settings: Settings | null }) {
  const today = todayIso(new Date());
  const [name, setName] = useState(settings?.businessName ?? "");
  const [startDate, setStartDate] = useState(settings?.businessStartDate ?? today);
  const [cash, setCash] = useState(paiseToRupeeInput(settings?.openingCashPaise ?? 0));
  const [online, setOnline] = useState(paiseToRupeeInput(settings?.openingOnlinePaise ?? 0));
  const save = useSaveSettings();
  const toast = useToast();
  const errors = fieldErrors(save.error);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(
      {
        businessName: name.trim(),
        businessStartDate: startDate,
        // An emptied amount means nothing was in hand.
        openingCash: cash || "0",
        openingOnline: online || "0",
      },
      {
        onSuccess: () => {
          toast(settings ? "Settings saved." : "Business set up. Every total counts from here.");
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <FormError
        error={save.error}
        shownFields={["businessName", "businessStartDate", "openingCash", "openingOnline"]}
      />
      <TextField
        label="Business name"
        maxLength={100}
        value={name}
        error={errors["businessName"]}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <DateField
        label="Books start on"
        hint="Entries can be made from this day on. Old register balances are dated this day."
        value={startDate}
        max={today}
        error={errors["businessStartDate"]}
        onChange={setStartDate}
      />
      <MoneyField
        label="Cash in hand that day"
        value={cash}
        error={errors["openingCash"]}
        onChange={setCash}
      />
      <MoneyField
        label="Money in the bank that day"
        value={online}
        error={errors["openingOnline"]}
        onChange={setOnline}
      />
      <Button type="submit" disabled={save.isPending || name.trim() === ""}>
        {save.isPending ? "Saving…" : settings ? "Save settings" : "Set up the business"}
      </Button>
    </form>
  );
}
