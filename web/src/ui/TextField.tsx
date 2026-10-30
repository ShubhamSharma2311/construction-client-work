import type { InputHTMLAttributes, ReactNode } from "react";
import { Field } from "./Field.tsx";
import fieldStyles from "./Field.module.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  id?: string | undefined;
}

export function TextField({ label, error, hint, id, className, ...rest }: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      {(control) => (
        <input
          {...control}
          className={`${fieldStyles.control} ${className ?? ""}`.trim()}
          {...rest}
        />
      )}
    </Field>
  );
}
