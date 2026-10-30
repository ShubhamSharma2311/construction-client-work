import { type ReactNode, useState } from "react";
import styles from "./FilterPanel.module.css";

/** The filters under a list, folded away until wanted; the count says how many are set. */
export function FilterPanel({ count, children }: { count: number; children: ReactNode }) {
  // Open at first if any filter is set; after that the person opens and closes it.
  const [initiallyOpen] = useState(count > 0);
  return (
    <details className={styles.panel} open={initiallyOpen}>
      <summary>{count > 0 ? `Filters (${String(count)})` : "Filters"}</summary>
      <div className={styles.grid}>{children}</div>
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
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {label}
    </label>
  );
}
