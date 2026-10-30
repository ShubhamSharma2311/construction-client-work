import type { ReactNode } from "react";

/** A screen's name, with its own buttons (paying, adding) right under it. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
