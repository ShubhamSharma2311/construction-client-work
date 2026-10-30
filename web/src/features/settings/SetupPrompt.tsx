import { ButtonLink } from "../../ui/ButtonLink.tsx";
import styles from "./SetupPrompt.module.css";

/** Shown where figures need the business settings (start date, opening cash) first. */
export function SetupPrompt() {
  return (
    <div className={styles.prompt}>
      <p>
        Enter the business name, start date and the cash you started with. Every total counts from
        there.
      </p>
      <ButtonLink to="/settings">Set up the business</ButtonLink>
    </div>
  );
}
