import { useEffect, useRef } from "react";
import { Register, RegisterLink } from "../ui/Register.tsx";
import { NEW_ENTRIES } from "./nav.ts";
import styles from "./NewEntryDialog.module.css";

export function NewEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // showModal focuses Close, which Safari outlines as if tabbed to. The title reads
      // the same to a screen reader and draws no box.
      title.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="new-entry-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.head}>
        <h2 id="new-entry-title" ref={title} tabIndex={-1} className={styles.title}>
          New entry
        </h2>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      <Register label="Kinds of entry">
        {NEW_ENTRIES.map((entry) => (
          <RegisterLink
            key={entry.to}
            to={entry.to}
            label={entry.label}
            detail={entry.detail}
            onClick={onClose}
          />
        ))}
      </Register>
    </dialog>
  );
}
