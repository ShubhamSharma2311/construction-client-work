import { Register, RegisterLink } from "../ui/Register.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { NEW_ENTRIES } from "./nav.ts";

export function NewEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="New entry">
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
    </Sheet>
  );
}
