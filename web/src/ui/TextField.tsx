import type { InputHTMLAttributes, ReactNode } from "react";
import { Input } from "../components/ui/input.tsx";
import { cn } from "../lib/utils.ts";
import { Field } from "./Field.tsx";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  id?: string | undefined;
}

export function TextField({ label, error, hint, id, className, ...rest }: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      {(control) => <Input {...control} className={cn("h-10", className)} {...rest} />}
    </Field>
  );
}
