import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useId, useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import { useToast } from "../../app/Toast.tsx";
import { useDebounced } from "../../lib/useDebounced.ts";
import { Button } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import fieldStyles from "../../ui/Field.module.css";
import { FormError } from "../../ui/FormError.tsx";
import { Money } from "../../ui/Money.tsx";
import {
  type CustomerFieldValues,
  CustomerFields,
  EMPTY_CUSTOMER,
  newCustomerBody,
} from "./CustomerFields.tsx";
import styles from "./CustomerPicker.module.css";
import { customerSearch, useCreateCustomer, useCustomerSearch } from "./useCustomers.ts";
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

/** Where focus goes after the picker changes shape, so keyboards never fall to the page top. */
type FocusTarget = "change" | "search" | "name" | null;

/** Find a customer as you type, or add a new one without leaving the entry. */
export function CustomerPicker({ value, onChange, error }: CustomerPickerProps) {
  const [adding, setAdding] = useState<string | null>(null);
  // Null on first render: an entry opened with a customer already chosen takes no focus.
  const [focus, setFocus] = useState<FocusTarget>(null);
  const pick = (customer: PickedCustomer) => {
    setAdding(null);
    setFocus("change");
    onChange(customer);
  };

  if (value) {
    return (
      <ChosenCustomer
        customer={value}
        focusChange={focus === "change"}
        onChange={() => {
          setFocus("search");
          onChange(null);
        }}
      />
    );
  }
  if (adding !== null) {
    return (
      <AddCustomer
        initialName={adding}
        onAdded={pick}
        onCancel={() => {
          setFocus("search");
          setAdding(null);
        }}
      />
    );
  }
  return (
    <CustomerSearch
      focusSearch={focus === "search"}
      onPick={pick}
      onAdd={(name) => {
        setFocus("name");
        setAdding(name);
      }}
      error={error}
    />
  );
}

function BalanceNote({ customerId }: { customerId: number }) {
  const dues = useDues();
  if (dues.isError)
    return <span className={styles.note}>Could not load what this customer owes.</span>;
  const row = dues.data?.customers.find((candidate) => candidate.customer.id === customerId);
  if (!row) return null;
  if (row.balancePaise > 0) {
    return (
      <span className={styles.note}>
        Owes <Money paise={row.balancePaise} tone="owed" />
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
  focusChange,
  onChange,
}: {
  customer: PickedCustomer;
  focusChange: boolean;
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
        <Button
          variant="quiet"
          onClick={onChange}
          autoFocus={focusChange}
          aria-label={`Change customer from ${customer.name}`}
        >
          Change
        </Button>
      </div>
    </div>
  );
}

function CustomerSearch({
  focusSearch,
  onPick,
  onAdd,
  error,
}: {
  focusSearch: boolean;
  onPick: (customer: PickedCustomer) => void;
  onAdd: (name: string) => void;
  error?: string | undefined;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const { api } = useServices();
  const queryClient = useQueryClient();
  const typed = term.trim();
  const searched = useDebounced(typed, 250);
  const search = useCustomerSearch(searched);
  const matches = search.data ?? [];
  // Matches belong to what is in the box only once its own search has come back; until
  // then the list shows the last answer, which Enter must not act on.
  const ready =
    searched === typed && search.isSuccess && !search.isPlaceholderData && !search.isFetching;
  // The last option adds what was typed as a new customer, offered only once nothing typed
  // is still being looked up, so an existing customer is not added twice.
  const canAdd = ready && typed !== "";
  const optionCount = matches.length + (canAdd ? 1 : 0);
  const current = optionCount === 0 ? -1 : Math.min(active, optionCount - 1);

  const choose = (index: number) => {
    const match = matches[index];
    if (match) onPick(match);
    else if (canAdd) onAdd(typed);
  };

  // Enter before the matches for what was typed have arrived: look them up now and take
  // the best one, instead of acting on the list still showing the last search.
  const chooseFresh = async () => {
    const fresh = await queryClient.query(customerSearch(api, typed));
    const best = fresh[0];
    if (best) onPick(best);
    else if (typed) onAdd(typed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(optionCount === 0 ? 0 : (Math.max(current, 0) + step + optionCount) % optionCount);
    } else if (event.key === "Enter") {
      // Enter picks the highlighted customer; it never submits the whole entry from here.
      event.preventDefault();
      if (!ready) void chooseFresh();
      else if (current >= 0) choose(current);
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
              open && current >= 0 ? `${listId}-${String(current)}` : undefined
            }
            autoComplete="off"
            autoFocus={focusSearch}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
            }}
            onKeyDown={onKeyDown}
          />
        )}
      </Field>
      {open ? (
        // mousedown would blur the input and close the list before the click lands.
        <div
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <ul id={listId} role="listbox" aria-label="Matching customers" className={styles.list}>
            {matches.map((customer, index) => (
              <li
                key={customer.id}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === current}
                className={styles.option}
                onClick={() => {
                  choose(index);
                }}
              >
                <span>{customer.name}</span>
                <small>{[customer.village, customer.phone].filter(Boolean).join(", ")}</small>
              </li>
            ))}
            {canAdd ? (
              <li
                id={`${listId}-${String(matches.length)}`}
                role="option"
                aria-selected={current === matches.length}
                className={`${styles.option} ${styles.add}`}
                onClick={() => {
                  onAdd(typed);
                }}
              >
                + Add “{typed}” as a new customer
              </li>
            ) : null}
          </ul>
          {!ready ? <p className={styles.status}>Searching…</p> : null}
          {ready && !typed && matches.length === 0 ? (
            <p className={styles.status}>No customers yet. Type a name to add one.</p>
          ) : null}
        </div>
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
  const [values, setValues] = useState<CustomerFieldValues>({
    ...EMPTY_CUSTOMER,
    name: initialName,
  });
  const create = useCreateCustomer();
  const toast = useToast();
  const canSave = !create.isPending && values.name.trim() !== "";

  const save = () => {
    create.mutate(newCustomerBody(values), {
      onSuccess: ({ customer, possibleDuplicates }) => {
        toast(addedText(customer.name, possibleDuplicates));
        onAdded(customer);
      },
    });
  };

  // A separate group, not a nested <form>: it lives inside the entry's own form, so Enter
  // here is caught and adds the customer instead of submitting the whole entry.
  return (
    <div
      className={styles.addPanel}
      role="group"
      aria-label="New customer"
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        if (canSave) save();
      }}
    >
      <span className={styles.addTitle}>New customer</span>
      <FormError error={create.error} shownFields={["name", "phone", "village"]} />
      <CustomerFields
        values={values}
        errors={fieldErrors(create.error)}
        onChange={setValues}
        withNotes={false}
        autoFocusName
      />
      <div className={styles.addActions}>
        <Button onClick={save} disabled={!canSave}>
          {create.isPending ? "Adding…" : "Add customer"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** "Gopal Ram added.", with a warning when the name looks like someone already entered. */
export function addedText(name: string, similar: { name: string }[]): string {
  if (similar.length === 0) return `${name} added.`;
  return `${name} added. Similar names already exist: ${similar.map((match) => match.name).join(", ")}.`;
}
