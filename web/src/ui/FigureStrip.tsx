import type { ReactNode } from "react";
import styles from "./FigureStrip.module.css";

export interface Figure {
  label: string;
  value: ReactNode;
}

/** A row of small totals over a list; two to a line on a narrow phone so amounts fit. */
export function FigureStrip({ figures, label }: { figures: Figure[]; label: string }) {
  return (
    <dl className={styles.strip} aria-label={label}>
      {figures.map((figure) => (
        <div key={figure.label}>
          <dt>{figure.label}</dt>
          <dd>{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One large total with its label, such as what customers owe. */
export function BigTotal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.big}>
      <span className={styles.bigLabel}>{label}</span>
      <span className={styles.bigFigure}>{children}</span>
    </div>
  );
}
