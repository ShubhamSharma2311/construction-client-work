import { useState } from "react";
import type { Ok } from "../../api/types.ts";
import { useDownload } from "../../api/useDownload.ts";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import type { DateRange } from "../../lib/ranges.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { Loading, LoadError, loadErrorMessage } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { useSettings } from "../settings/useSettings.ts";
import styles from "./CustomerAccountPage.module.css";
import { ApplyCredit, EditCustomer, OpeningBalance } from "./CustomerSheets.tsx";
import { canUseCredit, standingOf } from "./standing.ts";
import {
  type Customer,
  type CustomerBalance,
  useCustomer,
  useCustomerBalance,
  useCustomerLedger,
} from "./useCustomers.ts";
import { useOpeningBalance } from "./useOpeningBalance.ts";

type LedgerEntry = Ok<"/customers/{id}/ledger", "get">["entries"][number];

export function CustomerAccountPage({ id }: { id: number }) {
  const customer = useCustomer(id);
  if (customer.isError)
    return <LoadError error={customer.error} onRetry={() => void customer.refetch()} />;
  if (!customer.data) return <Loading what="the account" />;
  return <Account customer={customer.data} />;
}

function Account({ customer }: { customer: Customer }) {
  const balance = useCustomerBalance(customer.id);
  const settings = useSettings();

  return (
    <>
      <PageHeader title={customer.isActive ? customer.name : `${customer.name} (inactive)`} />
      {customer.village || customer.phone ? (
        <p className={styles.contact}>
          {customer.village}
          {customer.village && customer.phone ? ", " : ""}
          {customer.phone ? <a href={`tel:+91${customer.phone}`}>{customer.phone}</a> : null}
        </p>
      ) : null}
      {balance.isError ? (
        <LoadError error={balance.error} onRetry={() => void balance.refetch()} />
      ) : null}
      {balance.data ? <Balance balance={balance.data} /> : null}
      {balance.isPending ? <Loading what="the balance" /> : null}
      <AccountActions
        customer={customer}
        canApplyCredit={balance.data ? canUseCredit(balance.data) : false}
      />
      {/* Only the ledger's date picker needs the start date; the rest shows without it. */}
      {settings.isError ? (
        <LoadError error={settings.error} onRetry={() => void settings.refetch()} />
      ) : null}
      {settings.data ? (
        <Ledger customerId={customer.id} startDate={settings.data.businessStartDate} />
      ) : null}
    </>
  );
}

function Balance({ balance }: { balance: CustomerBalance }) {
  const standing = standingOf(balance);
  if (standing.kind === "owes") {
    return (
      <div className={`${styles.balance} ${styles.owes}`}>
        <span>Owes you</span>
        <Money paise={standing.paise} tone="owed" />
      </div>
    );
  }
  if (standing.kind === "credit") {
    return (
      <div className={`${styles.balance} ${styles.credit}`}>
        <span>Has credit</span>
        <Money paise={standing.paise} tone="received" />
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

type SheetName = "edit" | "opening" | "credit";

function AccountActions({
  customer,
  canApplyCredit,
}: {
  customer: Customer;
  canApplyCredit: boolean;
}) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const opening = useOpeningBalance(customer.id);
  const close = () => {
    setSheet(null);
  };
  const query = `customer=${String(customer.id)}`;
  const opener = (name: SheetName) => () => {
    setSheet(name);
  };

  return (
    <div className={actions.actions}>
      <ButtonLink to={`/new/payment?${query}`}>Money from {customer.name}</ButtonLink>
      <ButtonLink variant="secondary" to={`/new/payment?${query}&kind=writeoff`}>
        Write off
      </ButtonLink>
      {canApplyCredit ? (
        <Button variant="secondary" onClick={opener("credit")}>
          Use credit on dues
        </Button>
      ) : null}
      <Button variant="secondary" onClick={opener("edit")}>
        Edit details
      </Button>
      {opening.data === null ? (
        <Button variant="secondary" onClick={opener("opening")}>
          Old register balance
        </Button>
      ) : null}
      {/* Each sheet exists only while open: closing drops unsaved edits, old errors and its key. */}
      {sheet === "edit" ? <EditCustomer customer={customer} onClose={close} /> : null}
      {sheet === "opening" ? <OpeningBalance customer={customer} onClose={close} /> : null}
      {sheet === "credit" ? <ApplyCredit customer={customer} onClose={close} /> : null}
    </div>
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
        ) : entry.creditPaise > 0 ? (
          <span className={styles.paid}>−{formatRupees(entry.creditPaise)}</span>
        ) : null,
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
