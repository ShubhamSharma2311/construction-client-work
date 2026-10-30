import { formatRupees } from "../lib/money.ts";
import styles from "./Money.module.css";

/** owed: money still to come in (register red). received: money that came in. */
export type MoneyTone = "plain" | "owed" | "received";

export function Money({ paise, tone = "plain" }: { paise: number; tone?: MoneyTone }) {
  return <span className={`${styles.money} ${styles[tone]}`}>{formatRupees(paise)}</span>;
}
