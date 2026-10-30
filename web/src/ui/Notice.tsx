import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "../components/ui/alert.tsx";

/** A problem the person has to act on; screen readers announce it straight away. */
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
