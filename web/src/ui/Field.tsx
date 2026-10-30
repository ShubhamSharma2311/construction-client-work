import { type ReactNode, useId } from "react";
import { Field as ShadField, FieldDescription, FieldLabel } from "../components/ui/field.tsx";

export interface FieldControlProps {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

export interface FieldProps {
  label: string;
  error?: string | undefined;
  /** A short note under the control, such as what will happen once saved. */
  hint?: ReactNode;
  id?: string | undefined;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label, control and message, wired together the same way for every kind of input. */
export function Field({ label, error, hint, id, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const messageId = `${controlId}-message`;
  const message = error ?? hint;
  return (
    <ShadField data-invalid={error ? true : undefined} className="gap-2">
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {children({
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": message ? messageId : undefined,
      })}
      {message ? (
        // Not FieldError: that one is a live alert, and the form's own notice already speaks up.
        <FieldDescription id={messageId} className={error ? "text-destructive" : undefined}>
          {message}
        </FieldDescription>
      ) : null}
    </ShadField>
  );
}
