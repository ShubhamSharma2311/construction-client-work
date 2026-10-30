import { TextField } from "../../ui/TextField.tsx";

export interface PartnerValues {
  name: string;
  /** Percent as typed, e.g. "50" or "33.33"; empty until agreed. */
  sharePercent: string;
  notes: string;
}

const PERCENT = /^\d{0,3}(\.\d{0,2})?$/;

/** The share as the API takes it: a number from 0 to 100, or null when not agreed yet. */
export function shareOf(text: string): number | null {
  return text.trim() === "" ? null : Number(text);
}

export function checkPartner(values: PartnerValues): Partial<Record<keyof PartnerValues, string>> {
  const share = shareOf(values.sharePercent);
  return {
    ...(values.name.trim() === "" ? { name: "Enter the partner's name" } : {}),
    ...(share !== null && (Number.isNaN(share) || share > 100)
      ? { sharePercent: "A share is 0 to 100 percent" }
      : {}),
  };
}

/** Name, share of profit and a note: the same fields when adding and editing a partner. */
export function PartnerFields({
  values,
  errors,
  onChange,
}: {
  values: PartnerValues;
  errors: Partial<Record<keyof PartnerValues, string>>;
  onChange: (values: PartnerValues) => void;
}) {
  return (
    <>
      <TextField
        label="Name"
        maxLength={100}
        value={values.name}
        error={errors.name}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <TextField
        label="Share of profit, in percent"
        inputMode="decimal"
        hint="Leave empty until agreed"
        value={values.sharePercent}
        error={errors.sharePercent}
        onChange={(event) => {
          if (PERCENT.test(event.target.value))
            onChange({ ...values, sharePercent: event.target.value });
        }}
      />
      <TextField
        label="Note"
        maxLength={500}
        value={values.notes}
        error={errors.notes}
        onChange={(event) => {
          onChange({ ...values, notes: event.target.value });
        }}
      />
    </>
  );
}
