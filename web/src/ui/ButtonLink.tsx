import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";

/** A link that moves to another screen but looks like a button, e.g. "New trip". */
export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: LinkProps & { variant?: "primary" | "secondary" }) {
  return (
    <Link
      className={`${styles.button} ${styles[variant]} ${styles.link} ${className ?? ""}`.trim()}
      {...rest}
    />
  );
}
