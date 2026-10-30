import type { ReactNode } from "react";
import styles from "./DetailList.module.css";

/** Label and value pairs for one entry, ruled like a register page. */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className={styles.list}>{children}</dl>;
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
