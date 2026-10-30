import { useState } from "react";
import type { IsoDate } from "../lib/dates.ts";
import {
  type DateRange,
  matchPreset,
  presetRange,
  RANGE_LABELS,
  RANGE_PRESETS,
} from "../lib/ranges.ts";
import { DateField } from "./DateField.tsx";
import styles from "./RangeChips.module.css";

export interface RangeChipsProps {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  today: IsoDate;
  startDate: IsoDate;
}

/** The common periods one tap away, and any two dates for the rest. */
export function RangeChips({ value, onChange, today, startDate }: RangeChipsProps) {
  const picked = matchPreset(value, today);
  const [custom, setCustom] = useState(picked === null);
  const showDates = custom || picked === null;

  return (
    <div className={styles.wrap}>
      <div className={styles.chips} role="group" aria-label="Dates">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={styles.chip}
            aria-pressed={!showDates && picked === preset}
            onClick={() => {
              setCustom(false);
              onChange(presetRange(preset, today));
            }}
          >
            {RANGE_LABELS[preset]}
          </button>
        ))}
        <button
          type="button"
          className={styles.chip}
          aria-pressed={showDates}
          onClick={() => {
            setCustom(true);
          }}
        >
          Pick dates
        </button>
      </div>
      {showDates ? (
        <div className={styles.dates}>
          <DateField
            label="From"
            value={value?.from ?? startDate}
            min={startDate}
            max={value?.to ?? today}
            onChange={(from) => {
              if (from) onChange({ from, to: value?.to ?? today });
            }}
          />
          <DateField
            label="To"
            value={value?.to ?? today}
            min={value?.from ?? startDate}
            max={today}
            onChange={(to) => {
              if (to) onChange({ from: value?.from ?? startDate, to });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
