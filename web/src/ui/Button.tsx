import type { ButtonHTMLAttributes } from "react";
import { Button as ShadButton } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet";
  /** Stretch to the width of its container, as main actions do on a phone. */
  block?: boolean;
}

/** The app's three kinds of button, mapped onto shadcn's. */
export const BUTTON_VARIANT = { primary: "default", secondary: "outline", quiet: "ghost" } as const;

// Comfortable to tap on a phone, and free to wrap a long name ("Pay Ramniwas Choudhary")
// onto two lines rather than widen the page; shadcn's default is sized for a mouse.
export const BUTTON_SIZE = "h-auto min-h-10 px-4 py-2 whitespace-normal text-center";

export function Button({
  variant = "primary",
  block = false,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <ShadButton
      type={type}
      variant={BUTTON_VARIANT[variant]}
      size="lg"
      className={cn(BUTTON_SIZE, block && "w-full", className)}
      {...rest}
    />
  );
}
