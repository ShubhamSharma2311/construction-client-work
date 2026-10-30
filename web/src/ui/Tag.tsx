import type { ReactNode } from "react";
import styles from "./Tag.module.css";

/** owed: red, like a due in the register. received: settled. partial: some came in. */
export type TagTone = "owed" | "received" | "partial" | "quiet";

export function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}
