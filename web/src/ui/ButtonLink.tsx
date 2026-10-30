import { Link, type LinkProps } from "react-router";
import { Button as ShadButton } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";
import { BUTTON_SIZE, BUTTON_VARIANT } from "./Button.tsx";

/** A link that moves to another screen but looks like a button, e.g. "New trip". */
export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: LinkProps & { variant?: "primary" | "secondary" }) {
  return (
    <ShadButton
      asChild
      variant={BUTTON_VARIANT[variant]}
      size="lg"
      className={cn(BUTTON_SIZE, className)}
    >
      <Link {...rest} />
    </ShadButton>
  );
}
