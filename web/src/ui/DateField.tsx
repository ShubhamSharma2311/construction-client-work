import type { ReactNode } from "react";
import { Input } from "../components/ui/input.tsx";
import type { IsoDate } from "../lib/dates.ts";
import { Field } from "./Field.tsx";

export interface DateFieldProps {
  label: string;
  value: IsoDate;
  onChange: (value: IsoDate) => void;
  min?: IsoDate | undefined;
  max?: IsoDate | undefined;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
}

/** The phone's own date picker: quicker to use than anything drawn on the page. */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  error,
  hint,
  required,
}: DateFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(control) => (
        <Input
          {...control}
          type="date"
          className="h-10"
          value={value}
          min={min}
          max={max}
          required={required}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
