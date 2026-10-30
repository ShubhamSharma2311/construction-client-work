import type { ReactNode } from "react";
import { isRupeeInput } from "../lib/money.ts";
import { Field } from "./Field.tsx";
import fieldStyles from "./Field.module.css";
import styles from "./MoneyField.module.css";

export interface MoneyFieldProps {
  label: string;
  /** Rupees as typed, e.g. "3500" or "3500.50"; sent to the API as is. */
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: ReactNode;
  /** The main amount of a form gets large figures. */
  large?: boolean;
  required?: boolean;
  id?: string;
}

export function MoneyField({
  label,
  value,
  onChange,
  error,
  hint,
  large,
  required,
  id,
}: MoneyFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      {(control) => (
        <div className={`${styles.wrap} ${large ? styles.large : ""}`}>
          <span className={styles.symbol} aria-hidden="true">
            ₹
          </span>
          <input
            {...control}
            className={`${fieldStyles.control} ${styles.input}`}
            inputMode="decimal"
            autoComplete="off"
            required={required}
            value={value}
            onChange={(event) => {
              // Refuse keystrokes that could never make an amount, instead of erroring later.
              if (isRupeeInput(event.target.value)) onChange(event.target.value);
            }}
          />
        </div>
      )}
    </Field>
  );
}
