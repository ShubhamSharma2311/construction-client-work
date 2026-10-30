import { useState } from "react";
import { fieldErrors } from "../../api/errors.ts";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import type { Ok } from "../../api/types.ts";
import { useDownload } from "../../api/useDownload.ts";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import type { DateRange } from "../../lib/ranges.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError, loadErrorMessage } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { balanceText } from "../trips/balanceText.ts";
import styles from "./CustomerAccountPage.module.css";
import { CustomerFields, customerChanges, customerFieldsOf } from "./CustomerFields.tsx";
import { useDues } from "./useDues.ts";
import {
  type Customer,
  useAddOpeningBalance,
  useApplyCredit,
  useCustomer,
  useCustomerLedger,
  useUpdateCustomer,
} from "./useCustomers.ts";
import { useOpeningBalance } from "./useOpeningBalance.ts";

type LedgerEntry = Ok<"/customers/{id}/ledger", "get">["entries"][number];

export function CustomerAccountPage({ id }: { id: number }) {
  const customer = useCustomer(id);
  const settings = useSettings();
  if (customer.isError)
    return <LoadError error={customer.error} onRetry={() => void customer.refetch()} />;
  if (!customer.data || settings.data === undefined) return <Loading what="the account" />;
  return <Account customer={customer.data} startDate={settings.data?.businessStartDate ?? null} />;
}

function Account({ customer, startDate }: { customer: Customer; startDate: IsoDate | null }) {
  const dues = useDues();
  const row = dues.data?.customers.find((candidate) => candidate.customer.id === customer.id);
  const contact = [customer.village, customer.phone].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader title={customer.isActive ? customer.name : `${customer.name} (inactive)`} />
      {contact ? (
        <p className={styles.contact}>
          {customer.village}
          {customer.village && customer.phone ? ", " : ""}
          {customer.phone ? <a href={`tel:+91${customer.phone}`}>{customer.phone}</a> : null}
        </p>
      ) : null}
      {dues.isError ? (
        <ErrorNotice>
          Could not load what {customer.name} owes. The account below is still correct.
        </ErrorNotice>
      ) : (
        <Balance
          owesPaise={row?.balancePaise ?? 0}
          creditPaise={row?.creditPaise ?? 0}
          loading={dues.isPending}
        />
      )}
      <AccountActions customer={customer} canApplyCredit={row?.hasUnappliedCredit ?? false} />
      {startDate ? <Ledger customerId={customer.id} startDate={startDate} /> : null}
    </>
  );
}

function Balance({
  owesPaise,
  creditPaise,
  loading,
}: {
  owesPaise: number;
  creditPaise: number;
  loading: boolean;
}) {
  if (loading) return <Loading what="the balance" />;
  if (owesPaise > 0) {
    return (
      <div className={`${styles.balance} ${styles.owes}`}>
        <span>Owes you</span>
        <Money paise={owesPaise} tone="owed" />
      </div>
    );
  }
  if (creditPaise > 0) {
    return (
      <div className={`${styles.balance} ${styles.credit}`}>
        <span>Has credit</span>
        <Money paise={creditPaise} tone="received" />
      </div>
    );
  }
  return (
    <div className={styles.balance}>
      <span>Account settled</span>
      <Money paise={0} />
    </div>
  );
}

function AccountActions({
  customer,
  canApplyCredit,
}: {
  customer: Customer;
  canApplyCredit: boolean;
}) {
  const [sheet, setSheet] = useState<"edit" | "opening" | "credit" | null>(null);
  const opening = useOpeningBalance(customer.id);
  const close = () => {
    setSheet(null);
  };
  const query = `customer=${String(customer.id)}`;

  return (
    <div className={actions.actions}>
      <ButtonLink to={`/new/payment?${query}`}>Payment received</ButtonLink>
      <ButtonLink variant="secondary" to={`/new/payment?${query}&kind=writeoff`}>
        Write off
      </ButtonLink>
      {canApplyCredit ? (
        <Button
          variant="secondary"
          onClick={() => {
            setSheet("credit");
          }}
        >
          Use credit on dues
        </Button>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => {
          setSheet("edit");
        }}
      >
        Edit details
      </Button>
      {opening.data === null ? (
        <Button
          variant="secondary"
          onClick={() => {
            setSheet("opening");
          }}
        >
          Old register balance
        </Button>
      ) : null}
      <EditCustomer customer={customer} open={sheet === "edit"} onClose={close} />
      <OpeningBalance customer={customer} open={sheet === "opening"} onClose={close} />
      <ApplyCredit customer={customer} open={sheet === "credit"} onClose={close} />
    </div>
  );
}

function EditCustomer({
  customer,
  open,
  onClose,
}: {
  customer: Customer;
  open: boolean;
  onClose: () => void;
}) {
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
    <Sheet open={open} onClose={onClose} title="Edit details">
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

function OpeningBalance({
  customer,
  open,
  onClose,
}: {
  customer: Customer;
  open: boolean;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const { key, renew } = useIdempotencyKey();
  const add = useAddOpeningBalance(customer.id);
  const toast = useToast();
  const errors = fieldErrors(add.error);

  return (
    <Sheet open={open} onClose={onClose} title="Old register balance">
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

function ApplyCredit({
  customer,
  open,
  onClose,
}: {
  customer: Customer;
  open: boolean;
  onClose: () => void;
}) {
  const { key } = useIdempotencyKey();
  const apply = useApplyCredit(customer.id);
  const toast = useToast();
  return (
    <ConfirmDialog
      open={open}
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
            toast(
              `${formatRupees(used)} of credit used. ${balanceText(customer.name, result.customerBalance)}`,
            );
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

const ENTRY_LINKS: Record<LedgerEntry["type"], (refId: number) => string> = {
  OPENING_BALANCE: (refId) => `/trips/${String(refId)}`,
  TRIP: (refId) => `/trips/${String(refId)}`,
  PAYMENT: (refId) => `/payments/${String(refId)}`,
  WRITE_OFF: (refId) => `/payments/${String(refId)}`,
};

function Ledger({ customerId, startDate }: { customerId: number; startDate: IsoDate }) {
  const today = todayIso(new Date());
  const [range, setRange] = useState<DateRange | null>(null);
  const ledger = useCustomerLedger(customerId, range);
  const download = useDownload();

  const columns: Column<LedgerEntry>[] = [
    {
      key: "date",
      header: "Date",
      cell: (entry) => formatDate(entry.date, today),
      phone: "hidden",
      margin: true,
    },
    { key: "entry", header: "Entry", cell: (entry) => entry.description, phone: "title" },
    {
      key: "owed",
      header: "Owed",
      cell: (entry) => (entry.debitPaise > 0 ? <Money paise={entry.debitPaise} tone="owed" /> : ""),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "paid",
      header: "Paid",
      cell: (entry) =>
        entry.creditPaise > 0 ? <Money paise={entry.creditPaise} tone="received" /> : "",
      phone: "hidden",
      numeric: true,
    },
    {
      key: "change",
      header: "",
      cell: (entry) =>
        entry.debitPaise > 0 ? (
          <span className={styles.owed}>+{formatRupees(entry.debitPaise)}</span>
        ) : (
          <span className={styles.paid}>−{formatRupees(entry.creditPaise)}</span>
        ),
      phone: "amount",
      numeric: true,
      phoneOnly: true,
    },
    {
      key: "balance",
      header: "Balance",
      cell: (entry) => <Money paise={entry.balancePaise} />,
      phone: "status",
      numeric: true,
    },
  ];

  return (
    <section className={styles.ledger} aria-label="Account">
      <div className={styles.ledgerHead}>
        <h2 className={styles.subhead}>Account</h2>
        <Button
          variant="quiet"
          disabled={download.isPending}
          onClick={() => {
            download.mutate({
              path: `/customers/${String(customerId)}/ledger/export`,
              ...(range ? { query: { from: range.from, to: range.to } } : {}),
            });
          }}
        >
          {download.isPending ? "Preparing…" : "Download"}
        </Button>
      </div>
      {download.isError ? <ErrorNotice>{loadErrorMessage(download.error)}</ErrorNotice> : null}
      <RangeChips value={range} onChange={setRange} today={today} startDate={startDate} />
      {ledger.isPending ? <Loading what="the account" /> : null}
      {ledger.isError ? (
        <LoadError error={ledger.error} onRetry={() => void ledger.refetch()} />
      ) : null}
      {ledger.data ? (
        <>
          {range ? (
            <p className={styles.carried}>
              Brought forward from before {formatDate(range.from, today)}:{" "}
              <Money paise={ledger.data.openingBalancePaise} />
            </p>
          ) : null}
          <EntryTable
            caption="Account entries"
            rows={ledger.data.entries}
            columns={columns}
            rowKey={(entry) => `${entry.type}-${String(entry.refId)}`}
            rowLink={(entry) => ENTRY_LINKS[entry.type](entry.refId)}
            rowLabel={(entry) => `${entry.description}, ${formatDate(entry.date, today)}`}
            phoneMeta={(entry) => formatDate(entry.date, today)}
            empty={range ? "No entries in these dates." : "No entries yet."}
          />
          <p className={styles.carried}>
            Balance at the end:{" "}
            <Money
              paise={ledger.data.closingBalancePaise}
              tone={ledger.data.closingBalancePaise > 0 ? "owed" : "plain"}
            />
          </p>
        </>
      ) : null}
    </section>
  );
}
