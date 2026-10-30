import type { ReactNode } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../components/ui/input-group.tsx";
import { cleanRupeeInput, isRupeeInput } from "../lib/money.ts";
import { cn } from "../lib/utils.ts";
import { Field } from "./Field.tsx";

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
        <InputGroup className={large ? "h-12" : "h-10"}>
          <InputGroupAddon aria-hidden="true">
            <InputGroupText className={cn(large && "text-lg")}>₹</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            {...control}
            className={cn("tabular-nums", large && "text-xl font-semibold")}
            inputMode="decimal"
            autoComplete="off"
            required={required}
            value={value}
            onChange={(event) => {
              // Refuse keystrokes that could never make an amount, instead of erroring later.
              const cleaned = cleanRupeeInput(event.target.value);
              if (isRupeeInput(cleaned)) onChange(cleaned);
            }}
          />
        </InputGroup>
      )}
    </Field>
  );
}
