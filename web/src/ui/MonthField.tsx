import { useId, useState } from "react";
import { formatMonth } from "../lib/dates.ts";
import fieldStyles from "./Field.module.css";
import styles from "./MonthField.module.css";

// The same short names the rest of the app shows ("Sept" on some devices, "Sep" on others).
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) =>
  formatMonth(`2000-${String(index + 1).padStart(2, "0")}`).replace(/ 2000$/, ""),
);

export interface MonthFieldProps {
  label: string;
  /** "2026-04", or "" until both parts are picked. */
  value: string;
  onChange: (value: string) => void;
  /** Years offered, inclusive. */
  fromYear: number;
  toYear: number;
  error?: string | undefined;
  hint?: string | undefined;
}

/**
 * A month as two short dropdowns. Browsers' own month inputs are plain text boxes on desktop
 * Safari and Firefox, with no hint of the "2026-04" they want; dropdowns work everywhere.
 */
export function MonthField({
  label,
  value,
  onChange,
  fromYear,
  toYear,
  error,
  hint,
}: MonthFieldProps) {
  // Only a half-picked month lives here; a complete value always comes from the props.
  const [partial, setPartial] = useState({ year: "", month: "" });
  const complete = /^\d{4}-\d{2}$/.test(value);
  const year = complete ? value.slice(0, 4) : partial.year;
  const month = complete ? value.slice(5, 7) : partial.month;
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const range = Array.from({ length: toYear - fromYear + 1 }, (_, index) => String(toYear - index));
  // A value outside the range (such as last December in January) still shows its year.
  const years = year && !range.includes(year) ? [...range, year].sort().reverse() : range;
  const describedBy = message ? messageId : undefined;

  const pick = (nextYear: string, nextMonth: string) => {
    setPartial({ year: nextYear, month: nextMonth });
    onChange(nextYear && nextMonth ? `${nextYear}-${nextMonth}` : "");
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend className={fieldStyles.label}>{label}</legend>
      <div className={styles.pair}>
        <select
          aria-label={`${label}: month`}
          className={fieldStyles.control}
          value={month}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            pick(year, event.target.value);
          }}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}: year`}
          className={fieldStyles.control}
          value={year}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            pick(event.target.value, month);
          }}
        >
          <option value="">Year</option>
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {message ? (
        <span id={messageId} className={error ? fieldStyles.error : fieldStyles.hint}>
          {message}
        </span>
      ) : null}
    </fieldset>
  );
}
