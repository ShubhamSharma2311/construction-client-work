import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import { ErrorNotice } from "./Notice.tsx";
import { Sheet } from "./Sheet.tsx";
import sheetStyles from "./Sheet.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Says exactly what happens, e.g. "Delete trip". */
  confirmLabel: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks before anything that removes or moves money; the page cannot use window.confirm. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={sheetStyles.body}>
        {children}
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <Button block onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
        <Button block variant="secondary" onClick={onClose} disabled={busy}>
          Keep it
        </Button>
      </div>
    </Sheet>
  );
}
