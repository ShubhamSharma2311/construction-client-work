import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../lib/utils.ts";

const LIST = "m-0 list-none divide-y overflow-hidden rounded-xl border bg-card p-0 shadow-xs";
const ROW = "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left";
const ACTIVE =
  "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none";

/** A list of entries in a card; every list of entries uses it. */
export function Register({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={LIST} aria-label={label}>
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
      <span className="grid min-w-0 gap-0.5 break-words">
        <span className="font-medium">{label}</span>
        {detail ? <small className="text-sm text-muted-foreground">{detail}</small> : null}
      </span>
      {amount === undefined ? null : (
        <span className="text-right font-semibold tabular-nums">{amount}</span>
      )}
    </>
  );
}

export function RegisterRow({ action, ...content }: RowContent & { action?: ReactNode }) {
  return (
    <li className={cn(ROW, action && "grid-cols-[minmax(0,1fr)_auto_auto]")}>
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
      <Link to={to} className={cn(ROW, ACTIVE, "text-foreground no-underline")} onClick={onClick}>
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
        className={cn(ROW, ACTIVE, "border-0 bg-transparent disabled:opacity-50")}
        onClick={onClick}
        disabled={disabled}
      >
        <RowBody {...content} />
      </button>
    </li>
  );
}
