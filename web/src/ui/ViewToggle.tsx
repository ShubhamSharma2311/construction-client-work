import { SEGMENT, SEGMENTS, SEGMENTS_FRAME } from "./segmented.ts";

export interface ViewOption<T extends string> {
  value: T;
  label: string;
}

/** Ways to look at one screen, such as "Pending money" and "All customers". Many scroll sideways. */
export function ViewToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly ViewOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={SEGMENTS_FRAME}>
      <div className={SEGMENTS} role="group" aria-label="Show">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={SEGMENT}
            aria-pressed={option.value === value}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
