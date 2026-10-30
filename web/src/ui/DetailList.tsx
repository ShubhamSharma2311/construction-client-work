import type { ReactNode } from "react";

/** Label and value pairs for one entry, in a card like the rest of the app. */
export function DetailList({ children }: { children: ReactNode }) {
  // Each cell draws its own right and bottom rule; the frame hides the outer ones, so a
  // short last row leaves white space instead of grey blocks.
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <dl className="-mr-px -mb-px grid sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
    </div>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-r border-b px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="m-0 font-medium break-words">{children}</dd>
    </div>
  );
}
