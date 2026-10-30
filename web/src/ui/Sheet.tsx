import { type ReactNode, useEffect, useId, useRef } from "react";
import styles from "./Sheet.module.css";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A modal on the native <dialog>: focus stays inside, Escape closes it, and on a phone it
 * rises from the bottom within reach of the thumb.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // showModal focuses the first button, which Safari outlines as if tabbed to. The
      // title reads the same to a screen reader and draws no box.
      heading.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.head}>
        <h2 id={titleId} ref={heading} tabIndex={-1} className={styles.title}>
          {title}
        </h2>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      {open ? children : null}
    </dialog>
  );
}
