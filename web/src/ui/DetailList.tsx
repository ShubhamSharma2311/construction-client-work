import type { ReactNode } from "react";

/** Label and value pairs for one entry, in a card like the rest of the app. */
export function DetailList({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </dl>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="m-0 font-medium break-words">{children}</dd>
    </div>
  );
}
