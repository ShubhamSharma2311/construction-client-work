import { useId } from "react";
import { cn } from "../lib/utils.ts";

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

/**
 * A row of options where exactly one is picked, such as how a trip was paid. Drawn like
 * shadcn's outline toggle group, but kept as real radios so the keyboard and screen readers
 * treat it as one choice.
 */
export function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
}: ChoiceProps<T>) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-2 text-sm leading-snug font-medium">{label}</legend>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${String(options.length)}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex h-10 cursor-pointer items-center justify-center rounded-lg border border-input bg-background px-2 text-center text-sm font-medium transition-colors hover:bg-muted",
              "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              error && "border-destructive",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              aria-invalid={error ? true : undefined}
              onChange={() => {
                onChange(option.value);
              }}
              className="sr-only"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <span id={errorId} className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}
