import type { ReactNode } from "react";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select.tsx";
import { Field } from "./Field.tsx";

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

/** shadcn's native select: on phones it opens the system picker, which is easiest to tap. */
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
        <NativeSelect
          {...control}
          className="w-full [&>select]:h-10"
          value={value}
          required={required}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {placeholder === undefined ? null : (
            <NativeSelectOption value="">{placeholder}</NativeSelectOption>
          )}
          {options.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}
