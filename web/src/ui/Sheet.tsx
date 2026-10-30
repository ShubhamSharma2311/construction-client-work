import { type ReactNode, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog.tsx";
import { Button } from "./Button.tsx";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * shadcn's dialog: focus stays inside, Escape closes it, and on a phone it rises from the
 * bottom within reach of the thumb.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[90dvh] overflow-y-auto md:max-w-lg max-md:top-auto max-md:bottom-0 max-md:max-w-none max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[max(1rem,env(safe-area-inset-bottom))]"
        onOpenAutoFocus={(event) => {
          // Radix would focus the first field, which on a phone opens the keyboard at once.
          // The title reads the same to a screen reader and draws no box.
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle ref={heading} tabIndex={-1} className="text-lg outline-none">
            {title}
          </DialogTitle>
          <Button variant="quiet" className="-mr-2" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
