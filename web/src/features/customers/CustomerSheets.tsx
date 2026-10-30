import { useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatRupees } from "../../lib/money.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import { balanceText } from "../trips/balanceText.ts";
import styles from "./CustomerAccountPage.module.css";
import { CustomerFields, customerChanges, customerFieldsOf } from "./CustomerFields.tsx";
import {
  type Customer,
  useAddOpeningBalance,
  useApplyCredit,
  useUpdateCustomer,
} from "./useCustomers.ts";

// The sheets on a customer's account. Each is mounted only while open, so it starts fresh.

export function EditCustomer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const before = customerFieldsOf(customer);
  const [values, setValues] = useState(before);
  const [active, setActive] = useState(customer.isActive);
  const update = useUpdateCustomer(customer.id);
  const toast = useToast();

  const save = () => {
    const changes = {
      ...customerChanges(before, values),
      ...(active === customer.isActive ? {} : { isActive: active }),
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
        <FormError error={update.error} shownFields={["name", "phone", "village", "notes"]} />
        <CustomerFields
          values={values}
          errors={fieldErrors(update.error)}
          onChange={setValues}
          withNotes
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => {
              setActive(event.target.checked);
            }}
          />
          Active (shown when entering trips)
        </label>
        <Button block onClick={save} disabled={update.isPending || values.name.trim() === ""}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </Sheet>
  );
}

export function OpeningBalance({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const { key, renew } = useIdempotencyKey();
  const add = useAddOpeningBalance(customer.id);
  const toast = useToast();
  const errors = fieldErrors(add.error);

  return (
    <Sheet open onClose={onClose} title="Old register balance">
      <div className={sheetStyles.body}>
        <p className={actions.text}>
          What {customer.name} already owed in the paper register when you started using this app.
          It is entered once and paid off first.
        </p>
        <FormError error={add.error} shownFields={["amount", "notes"]} />
        <MoneyField
          label="Amount owed"
          large
          value={amount}
          error={errors["amount"]}
          onChange={setAmount}
        />
        <TextField
          label="Note"
          maxLength={500}
          placeholder="e.g. from register page 14"
          value={notes}
          error={errors["notes"]}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <Button
          block
          disabled={add.isPending || amount === ""}
          onClick={() => {
            add.mutate(
              { body: { amount, ...(notes.trim() ? { notes: notes.trim() } : {}) }, key },
              {
                onSuccess: (saved) => {
                  toast(`Old balance added. ${balanceText(customer.name, saved.customerBalance)}`);
                  onClose();
                },
                onError: (error) => {
                  renewAfterMismatch(error, renew);
                },
              },
            );
          }}
        >
          {add.isPending ? "Saving…" : "Add old balance"}
        </Button>
      </div>
    </Sheet>
  );
}

export function ApplyCredit({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { key } = useIdempotencyKey();
  const apply = useApplyCredit(customer.id);
  const toast = useToast();
  return (
    <ConfirmDialog
      open
      title="Use credit on dues?"
      confirmLabel="Use credit"
      busy={apply.isPending}
      error={apply.isError ? saveErrorMessage(apply.error) : null}
      onClose={() => {
        apply.reset();
        onClose();
      }}
      onConfirm={() => {
        apply.mutate(key, {
          onSuccess: (result) => {
            const used = result.allocations.reduce((sum, line) => sum + line.amountPaise, 0);
            const what =
              used > 0 ? `${formatRupees(used)} of credit used.` : "Nothing was due to use it on.";
            toast(`${what} ${balanceText(customer.name, result.customerBalance)}`);
            onClose();
          },
        });
      }}
    >
      <p className={actions.text}>
        {customer.name} has money paid earlier that is not yet set against any trip. It will pay the
        oldest dues first.
      </p>
    </ConfirmDialog>
  );
}
