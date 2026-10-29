import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./Register.module.css";

/** A ruled list with the register's red margin; every list of entries uses it. */
export function Register({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.register} aria-label={label}>
      {children}
    </ul>
  );
}

interface RowContent {
  label: string;
  detail?: string | undefined;
}

function RowText({ label, detail }: RowContent) {
  return (
    <span className={styles.text}>
      {label}
      {detail ? <small className={styles.detail}>{detail}</small> : null}
    </span>
  );
}

export function RegisterLink({
  to,
  onClick,
  ...content
}: RowContent & { to: string; onClick?: () => void }) {
  return (
    <li>
      <Link to={to} className={styles.row} onClick={onClick}>
        <RowText {...content} />
      </Link>
    </li>
  );
}

export function RegisterButton({
  onClick,
  disabled,
  ...content
}: RowContent & { onClick: () => void; disabled?: boolean }) {
  return (
    <li>
      <button type="button" className={styles.row} onClick={onClick} disabled={disabled}>
        <RowText {...content} />
      </button>
    </li>
  );
}
