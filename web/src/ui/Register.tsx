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

export interface RowContent {
  label: ReactNode;
  detail?: ReactNode;
  /** Right-hand column, usually a <Money>. */
  amount?: ReactNode;
}

function RowBody({ label, detail, amount }: RowContent) {
  return (
    <>
      <span className={styles.text}>
        {label}
        {detail ? <small className={styles.detail}>{detail}</small> : null}
      </span>
      {amount === undefined ? null : <span className={styles.amount}>{amount}</span>}
    </>
  );
}

export function RegisterRow({ action, ...content }: RowContent & { action?: ReactNode }) {
  return (
    <li className={`${styles.row} ${action ? styles.withAction : ""}`}>
      <RowBody {...content} />
      {action}
    </li>
  );
}

export function RegisterLink({
  to,
  onClick,
  ...content
}: RowContent & { to: string; onClick?: () => void }) {
  return (
    <li>
      <Link to={to} className={`${styles.row} ${styles.action}`} onClick={onClick}>
        <RowBody {...content} />
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
      <button
        type="button"
        className={`${styles.row} ${styles.action}`}
        onClick={onClick}
        disabled={disabled}
      >
        <RowBody {...content} />
      </button>
    </li>
  );
}
