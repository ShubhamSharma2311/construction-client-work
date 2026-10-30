import { Link } from "react-router";
import styles from "./SetupPrompt.module.css";

/** Shown where figures need the business settings (start date, opening cash) first. */
export function SetupPrompt() {
  return (
    <div className={styles.prompt}>
      <p>
        Enter the business name, start date and the cash you started with. Every total counts from
        there.
      </p>
      <Link to="/settings" className={styles.link}>
        Set up the business
      </Link>
    </div>
  );
}
