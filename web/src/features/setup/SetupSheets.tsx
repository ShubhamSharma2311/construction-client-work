import { useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { useToast } from "../../app/Toast.tsx";
import { edited, filled } from "../../lib/formValues.ts";
import { Button } from "../../ui/Button.tsx";
import { FilterCheckbox } from "../../ui/FilterPanel.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import type { Khet, Labourer } from "../masters/useMasters.ts";
import { useCreateKhet, useCreateLabourer, useUpdateKhet, useUpdateLabourer } from "./useSetup.ts";

interface KhetValues {
  name: string;
  location: string;
}

interface LabourerValues {
  name: string;
  phone: string;
  notes: string;
}

function KhetFields({
  values,
  errors,
  onChange,
}: {
  values: KhetValues;
  errors: Record<string, string>;
  onChange: (values: KhetValues) => void;
}) {
  return (
    <>
      <TextField
        label="Name"
        maxLength={100}
        value={values.name}
        error={errors["name"]}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <TextField
        label="Where it is"
        hint="Optional"
        maxLength={200}
        value={values.location}
        error={errors["location"]}
        onChange={(event) => {
          onChange({ ...values, location: event.target.value });
        }}
      />
    </>
  );
}

function LabourerFields({
  values,
  errors,
  onChange,
}: {
  values: LabourerValues;
  errors: Record<string, string>;
  onChange: (values: LabourerValues) => void;
}) {
  return (
    <>
      <TextField
        label="Name"
        maxLength={100}
        value={values.name}
        error={errors["name"]}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <TextField
        label="Phone"
        hint="Optional"
        inputMode="tel"
        value={values.phone}
        error={errors["phone"]}
        onChange={(event) => {
          onChange({ ...values, phone: event.target.value });
        }}
      />
      <TextField
        label="Note"
        hint="Optional"
        maxLength={500}
        value={values.notes}
        error={errors["notes"]}
        onChange={(event) => {
          onChange({ ...values, notes: event.target.value });
        }}
      />
    </>
  );
}

export function AddKhet({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<KhetValues>({ name: "", location: "" });
  const create = useCreateKhet();
  const toast = useToast();
  return (
    <Sheet open onClose={onClose} title="Add khet">
      <div className={sheetStyles.body}>
        <FormError error={create.error} shownFields={["name", "location"]} />
        <KhetFields values={values} errors={fieldErrors(create.error)} onChange={setValues} />
        <Button
          block
          disabled={create.isPending || values.name.trim() === ""}
          onClick={() => {
            const location = filled(values.location);
            create.mutate(
              { name: values.name.trim(), ...(location ? { location } : {}) },
              {
                onSuccess: (khet) => {
                  toast(`${khet.name} added.`);
                  onClose();
                },
              },
            );
          }}
        >
          {create.isPending ? "Adding…" : "Add khet"}
        </Button>
      </div>
    </Sheet>
  );
}

export function EditKhet({ khet, onClose }: { khet: Khet; onClose: () => void }) {
  const before: KhetValues = { name: khet.name, location: khet.location ?? "" };
  const [values, setValues] = useState(before);
  const [active, setActive] = useState(khet.isActive);
  const update = useUpdateKhet(khet.id);
  const toast = useToast();
  const save = () => {
    // The button stays off while the name is empty, so a cleared name never gets here.
    const name = edited(before.name, values.name);
    const location = edited(before.location, values.location);
    const changes = {
      ...(name ? { name } : {}),
      ...(location === undefined ? {} : { location }),
      ...(active === khet.isActive ? {} : { isActive: active }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate(changes, {
      onSuccess: (saved) => {
        toast(`${saved.name} saved.`);
        onClose();
      },
    });
  };
  return (
    <Sheet open onClose={onClose} title={`Edit ${khet.name}`}>
      <div className={sheetStyles.body}>
        <FormError error={update.error} shownFields={["name", "location"]} />
        <KhetFields values={values} errors={fieldErrors(update.error)} onChange={setValues} />
        <FilterCheckbox
          label="In use (shown when entering trips)"
          checked={active}
          onChange={setActive}
        />
        <Button block onClick={save} disabled={update.isPending || values.name.trim() === ""}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Sheet>
  );
}

export function AddLabourer({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<LabourerValues>({ name: "", phone: "", notes: "" });
  const create = useCreateLabourer();
  const toast = useToast();
  return (
    <Sheet open onClose={onClose} title="Add labourer">
      <div className={sheetStyles.body}>
        <FormError error={create.error} shownFields={["name", "phone", "notes"]} />
        <LabourerFields values={values} errors={fieldErrors(create.error)} onChange={setValues} />
        <Button
          block
          disabled={create.isPending || values.name.trim() === ""}
          onClick={() => {
            const phone = filled(values.phone);
            const notes = filled(values.notes);
            create.mutate(
              {
                name: values.name.trim(),
                ...(phone ? { phone } : {}),
                ...(notes ? { notes } : {}),
              },
              {
                onSuccess: (labourer) => {
                  toast(`${labourer.name} added.`);
                  onClose();
                },
              },
            );
          }}
        >
          {create.isPending ? "Adding…" : "Add labourer"}
        </Button>
      </div>
    </Sheet>
  );
}

export function EditLabourer({ labourer, onClose }: { labourer: Labourer; onClose: () => void }) {
  const before: LabourerValues = {
    name: labourer.name,
    phone: labourer.phone ?? "",
    notes: labourer.notes ?? "",
  };
  const [values, setValues] = useState(before);
  const [active, setActive] = useState(labourer.isActive);
  const update = useUpdateLabourer(labourer.id);
  const toast = useToast();
  const save = () => {
    const name = edited(before.name, values.name);
    const phone = edited(before.phone, values.phone);
    const notes = edited(before.notes, values.notes);
    const changes = {
      ...(name ? { name } : {}),
      ...(phone === undefined ? {} : { phone }),
      ...(notes === undefined ? {} : { notes }),
      ...(active === labourer.isActive ? {} : { isActive: active }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate(changes, {
      onSuccess: (saved) => {
        toast(`${saved.name} saved.`);
        onClose();
      },
    });
  };
  return (
    <Sheet open onClose={onClose} title={`Edit ${labourer.name}`}>
      <div className={sheetStyles.body}>
        <FormError error={update.error} shownFields={["name", "phone", "notes"]} />
        <LabourerFields values={values} errors={fieldErrors(update.error)} onChange={setValues} />
        <FilterCheckbox
          label="In use (shown when paying labour)"
          checked={active}
          onChange={setActive}
        />
        <Button block onClick={save} disabled={update.isPending || values.name.trim() === ""}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Sheet>
  );
}
