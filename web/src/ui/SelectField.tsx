import type { ReactNode } from "react";
import { Field } from "./Field.tsx";
import fieldStyles from "./Field.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown first with an empty value, e.g. "Choose a driver" or "All drivers". */
  placeholder?: string;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  disabled?: boolean;
}

/** A native select: on phones it opens the system picker, which is easiest to tap. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  required,
  disabled,
}: SelectFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(control) => (
        <select
          {...control}
          className={fieldStyles.control}
          value={value}
          required={required}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {placeholder === undefined ? null : <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
