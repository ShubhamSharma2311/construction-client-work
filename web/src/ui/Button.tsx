import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet";
  /** Stretch to the width of its container, as main actions do on a phone. */
  block?: boolean;
}

export function Button({
  variant = "primary",
  block = false,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], block ? styles.block : "", className ?? ""];
  return <button type={type} className={classes.join(" ").trim()} {...rest} />;
}
