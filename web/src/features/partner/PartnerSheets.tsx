import { useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { useToast } from "../../app/Toast.tsx";
import { Button } from "../../ui/Button.tsx";
import { FilterCheckbox } from "../../ui/FilterPanel.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { checkPartner, PartnerFields, type PartnerValues, shareOf } from "./PartnerFields.tsx";
import { type Partner, useCreatePartner, useUpdatePartner } from "./usePartner.ts";

export function AddPartner({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<PartnerValues>({ name: "", sharePercent: "", notes: "" });
  const [tried, setTried] = useState(false);
  const create = useCreatePartner();
  const toast = useToast();
  const problems = tried ? checkPartner(values) : {};
  const server = fieldErrors(create.error);
  return (
    <Sheet open onClose={onClose} title="Add partner">
      <div className={sheetStyles.body}>
        <FormError error={create.error} shownFields={["name", "sharePercent", "notes"]} />
        <PartnerFields values={values} errors={{ ...server, ...problems }} onChange={setValues} />
        <Button
          block
          disabled={create.isPending}
          onClick={() => {
            setTried(true);
            if (Object.keys(checkPartner(values)).length > 0) return;
            const share = shareOf(values.sharePercent);
            create.mutate(
              {
                name: values.name.trim(),
                ...(share === null ? {} : { sharePercent: share }),
                ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
              },
              {
                onSuccess: (partner) => {
                  toast(`${partner.name} added.`);
                  onClose();
                },
              },
            );
          }}
        >
          {create.isPending ? "Adding…" : "Add partner"}
        </Button>
      </div>
    </Sheet>
  );
}

export function EditPartner({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const before: PartnerValues = {
    name: partner.name,
    sharePercent: partner.sharePercent === null ? "" : String(partner.sharePercent),
    notes: partner.notes ?? "",
  };
  const [values, setValues] = useState(before);
  const [active, setActive] = useState(partner.isActive);
  const [tried, setTried] = useState(false);
  const update = useUpdatePartner(partner.id);
  const toast = useToast();
  const problems = tried ? checkPartner(values) : {};
  const server = fieldErrors(update.error);

  const save = () => {
    setTried(true);
    if (Object.keys(checkPartner(values)).length > 0) return;
    const changes = {
      ...(values.name.trim() === before.name ? {} : { name: values.name.trim() }),
      ...(values.sharePercent === before.sharePercent
        ? {}
        : { sharePercent: shareOf(values.sharePercent) }),
      ...(values.notes.trim() === before.notes ? {} : { notes: values.notes.trim() }),
      ...(active === partner.isActive ? {} : { isActive: active }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate(changes, {
      onSuccess: () => {
        toast("Details saved.");
        onClose();
      },
    });
  };

  return (
    <Sheet open onClose={onClose} title="Edit details">
      <div className={sheetStyles.body}>
        <FormError error={update.error} shownFields={["name", "sharePercent", "notes"]} />
        <PartnerFields values={values} errors={{ ...server, ...problems }} onChange={setValues} />
        <FilterCheckbox label="Active" checked={active} onChange={setActive} />
        <Button block onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </Sheet>
  );
}
