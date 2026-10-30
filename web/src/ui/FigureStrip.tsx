import type { ReactNode } from "react";

export interface Figure {
  label: string;
  value: ReactNode;
}

/** A row of small totals over a list; two to a line on a narrow phone so amounts fit. */
export function FigureStrip({ figures, label }: { figures: Figure[]; label: string }) {
  // Cells draw their own rules and the frame hides the outer ones (see DetailList).
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <dl
        className="-mr-px -mb-px grid grid-cols-2 md:auto-cols-fr md:grid-flow-col md:grid-cols-none"
        aria-label={label}
      >
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex min-w-0 flex-col gap-1 border-r border-b px-4 py-3"
          >
            <dt className="text-sm text-muted-foreground">{figure.label}</dt>
            <dd className="m-0 text-xl font-semibold tracking-tight tabular-nums">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One large total with its label, such as what customers owe. */
export function BigTotal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-4xl font-semibold tracking-tight tabular-nums">{children}</span>
    </div>
  );
}
