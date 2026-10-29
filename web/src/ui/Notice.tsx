import type { ReactNode } from "react";
import styles from "./Notice.module.css";

/** A problem the person has to act on; screen readers announce it straight away. */
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={styles.error}>
      {children}
    </div>
  );
}
