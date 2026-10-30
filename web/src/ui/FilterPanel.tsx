import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Label } from "../components/ui/label.tsx";

/** The filters under a list, folded away until wanted; the count says how many are set. */
export function FilterPanel({ count, children }: { count: number; children: ReactNode }) {
  // Open at first if any filter is set; after that the person opens and closes it.
  const [initiallyOpen] = useState(count > 0);
  return (
    <details className="group rounded-xl border bg-card shadow-xs" open={initiallyOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {count > 0 ? `Filters (${String(count)})` : "Filters"}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </details>
  );
}

export function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-10 items-center gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          onChange(next === true);
        }}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
