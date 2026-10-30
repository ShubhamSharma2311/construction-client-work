import { type ReactNode, useId } from "react";
import styles from "./Field.module.css";

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
    <div className={styles.field}>
      <label htmlFor={controlId} className={styles.label}>
        {label}
      </label>
      {children({
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": message ? messageId : undefined,
      })}
      {message ? (
        <span id={messageId} className={error ? styles.error : styles.hint}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
