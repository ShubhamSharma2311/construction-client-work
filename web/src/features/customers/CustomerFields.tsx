import { TextField } from "../../ui/TextField.tsx";
import styles from "./CustomerFields.module.css";

export interface CustomerFieldValues {
  name: string;
  phone: string;
  village: string;
  notes: string;
}

export const EMPTY_CUSTOMER: CustomerFieldValues = { name: "", phone: "", village: "", notes: "" };

/** Name, phone, village and note: the same fields when adding a customer and editing one. */
export function CustomerFields({
  values,
  errors,
  onChange,
  withNotes,
  autoFocusName = false,
}: {
  values: CustomerFieldValues;
  errors: Record<string, string>;
  onChange: (values: CustomerFieldValues) => void;
  withNotes: boolean;
  /** Set when the fields open from a tap on "Add", so typing can start at once. */
  autoFocusName?: boolean;
}) {
  const set = (field: keyof CustomerFieldValues, value: string) => {
    onChange({ ...values, [field]: value });
  };
  return (
    <>
      <TextField
        label="Name"
        maxLength={100}
        autoFocus={autoFocusName}
        value={values.name}
        error={errors["name"]}
        onChange={(event) => {
          set("name", event.target.value);
        }}
      />
      <div className={styles.pair}>
        <TextField
          label="Phone"
          inputMode="tel"
          autoComplete="off"
          value={values.phone}
          error={errors["phone"]}
          onChange={(event) => {
            set("phone", event.target.value);
          }}
        />
        <TextField
          label="Village"
          maxLength={100}
          value={values.village}
          error={errors["village"]}
          onChange={(event) => {
            set("village", event.target.value);
          }}
        />
      </div>
      {withNotes ? (
        <TextField
          label="Note"
          maxLength={500}
          value={values.notes}
          error={errors["notes"]}
          onChange={(event) => {
            set("notes", event.target.value);
          }}
        />
      ) : null}
    </>
  );
}

/** Only filled-in fields, as POST /customers takes them. */
export function newCustomerBody(values: CustomerFieldValues) {
  const text = (value: string) => value.trim();
  return {
    name: text(values.name),
    ...(text(values.phone) ? { phone: text(values.phone) } : {}),
    ...(text(values.village) ? { village: text(values.village) } : {}),
    ...(text(values.notes) ? { notes: text(values.notes) } : {}),
  };
}

export function customerFieldsOf(customer: {
  name: string;
  phone: string | null;
  village: string | null;
  notes: string | null;
}): CustomerFieldValues {
  return {
    name: customer.name,
    phone: customer.phone ?? "",
    village: customer.village ?? "",
    notes: customer.notes ?? "",
  };
}

/** Only what changed, as PATCH /customers/:id takes it; a cleared phone is sent as null. */
export function customerChanges(before: CustomerFieldValues, after: CustomerFieldValues) {
  const changes: { name?: string; phone?: string | null; village?: string; notes?: string } = {};
  if (after.name.trim() !== before.name) changes.name = after.name.trim();
  if (after.phone.trim() !== before.phone)
    changes.phone = after.phone.trim() === "" ? null : after.phone.trim();
  if (after.village.trim() !== before.village) changes.village = after.village.trim();
  if (after.notes.trim() !== before.notes) changes.notes = after.notes.trim();
  return changes;
}
