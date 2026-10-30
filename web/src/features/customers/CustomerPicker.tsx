import { type KeyboardEvent, useId, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { useToast } from "../../app/Toast.tsx";
import { useDebounced } from "../../lib/useDebounced.ts";
import { Button } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import fieldStyles from "../../ui/Field.module.css";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { TextField } from "../../ui/TextField.tsx";
import styles from "./CustomerPicker.module.css";
import { useCreateCustomer, useCustomerSearch } from "./useCustomers.ts";
import { useDues } from "./useDues.ts";

export interface PickedCustomer {
  id: number;
  name: string;
  village?: string | null | undefined;
}

export interface CustomerPickerProps {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  error?: string | undefined;
}

/** Find a customer as you type, or add a new one without leaving the entry. */
export function CustomerPicker({ value, onChange, error }: CustomerPickerProps) {
  const [adding, setAdding] = useState<string | null>(null);
  if (value)
    return (
      <ChosenCustomer
        customer={value}
        onChange={() => {
          onChange(null);
        }}
      />
    );
  if (adding !== null) {
    return (
      <AddCustomer
        initialName={adding}
        onAdded={(customer) => {
          setAdding(null);
          onChange(customer);
        }}
        onCancel={() => {
          setAdding(null);
        }}
      />
    );
  }
  return <CustomerSearch onPick={onChange} onAdd={setAdding} error={error} />;
}

function BalanceNote({ customerId }: { customerId: number }) {
  const dues = useDues();
  const row = dues.data?.customers.find((candidate) => candidate.customer.id === customerId);
  if (!row) return null;
  if (row.balancePaise > 0) {
    return (
      <span className={styles.note}>
        Already owes <Money paise={row.balancePaise} tone="owed" />
      </span>
    );
  }
  if (row.creditPaise > 0) {
    return (
      <span className={styles.note}>
        Has <Money paise={row.creditPaise} tone="received" /> credit
      </span>
    );
  }
  return null;
}

function ChosenCustomer({
  customer,
  onChange,
}: {
  customer: PickedCustomer;
  onChange: () => void;
}) {
  return (
    <div className={styles.field}>
      <span className={fieldStyles.label}>Customer</span>
      <div className={styles.chosen}>
        <span className={styles.chosenText}>
          <strong>{customer.name}</strong>
          {customer.village ? <small>{customer.village}</small> : null}
          <BalanceNote customerId={customer.id} />
        </span>
        <Button variant="quiet" onClick={onChange}>
          Change
        </Button>
      </div>
    </div>
  );
}

function CustomerSearch({
  onPick,
  onAdd,
  error,
}: {
  onPick: (customer: PickedCustomer) => void;
  onAdd: (name: string) => void;
  error?: string | undefined;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const search = useCustomerSearch(useDebounced(term.trim(), 250));
  const matches = search.data ?? [];
  const typed = term.trim();
  // The last option adds what was typed as a new customer.
  const optionCount = matches.length + (typed ? 1 : 0);

  const choose = (index: number) => {
    const match = matches[index];
    if (match) onPick(match);
    else if (typed) onAdd(typed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        optionCount === 0 ? 0 : (current + step + optionCount) % optionCount,
      );
    } else if (event.key === "Enter" && open && optionCount > 0) {
      // Pick the highlighted customer instead of submitting the whole entry.
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.field}>
      <Field label="Customer" error={error} hint="Type a name, village or phone number">
        {(control) => (
          <input
            {...control}
            className={fieldStyles.control}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              open && optionCount > 0 ? `${listId}-${String(active)}` : undefined
            }
            autoComplete="off"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
        )}
      </Field>
      {open ? (
        <ul id={listId} role="listbox" aria-label="Matching customers" className={styles.list}>
          {matches.map((customer, index) => (
            <li
              key={customer.id}
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              onClick={() => {
                choose(index);
              }}
            >
              <span>{customer.name}</span>
              <small>{[customer.village, customer.phone].filter(Boolean).join(", ")}</small>
            </li>
          ))}
          {typed ? (
            <li
              id={`${listId}-${String(matches.length)}`}
              role="option"
              aria-selected={active === matches.length}
              className={`${styles.option} ${styles.add}`}
              onClick={() => {
                onAdd(typed);
              }}
            >
              + Add “{typed}” as a new customer
            </li>
          ) : null}
          {!typed && matches.length === 0 && !search.isPending ? (
            <li className={styles.empty}>No customers yet. Type a name to add one.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function AddCustomer({
  initialName,
  onAdded,
  onCancel,
}: {
  initialName: string;
  onAdded: (customer: PickedCustomer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [village, setVillage] = useState("");
  const create = useCreateCustomer();
  const toast = useToast();
  const errors = fieldErrors(create.error);

  const save = () => {
    const body = { name, ...(phone ? { phone } : {}), ...(village ? { village } : {}) };
    create.mutate(body, {
      onSuccess: ({ customer, possibleDuplicates }) => {
        if (possibleDuplicates.length > 0) {
          const similar = possibleDuplicates.map((match) => match.name).join(", ");
          toast(`${customer.name} added. Similar names already exist: ${similar}.`);
        } else {
          toast(`${customer.name} added.`);
        }
        onAdded(customer);
      },
    });
  };

  // A separate group, not a nested <form>: it lives inside the entry's own form.
  return (
    <div className={styles.addPanel} role="group" aria-label="New customer">
      <span className={styles.addTitle}>New customer</span>
      {create.isError && Object.keys(errors).length === 0 ? (
        <ErrorNotice>{saveErrorMessage(create.error)}</ErrorNotice>
      ) : null}
      <TextField
        label="Name"
        value={name}
        error={errors["name"]}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <div className={styles.pair}>
        <TextField
          label="Phone"
          inputMode="tel"
          value={phone}
          error={errors["phone"]}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
        />
        <TextField
          label="Village"
          value={village}
          error={errors["village"]}
          onChange={(event) => {
            setVillage(event.target.value);
          }}
        />
      </div>
      <div className={styles.addActions}>
        <Button onClick={save} disabled={create.isPending || name.trim() === ""}>
          {create.isPending ? "Adding…" : "Add customer"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
