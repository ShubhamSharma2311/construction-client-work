import { useId } from "react";
import styles from "./Choice.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ChoiceOption<T>[];
  error?: string | undefined;
}

/** A row of options where exactly one is picked, such as how a trip was paid. */
export function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
}: ChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className={styles.fieldset} aria-invalid={error ? true : undefined}>
      <legend className={styles.legend}>{label}</legend>
      <div
        className={styles.options}
        style={{ gridTemplateColumns: `repeat(${String(options.length)}, 1fr)` }}
      >
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
              }}
              className={styles.radio}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error ? <span className={styles.error}>{error}</span> : null}
    </fieldset>
  );
}
