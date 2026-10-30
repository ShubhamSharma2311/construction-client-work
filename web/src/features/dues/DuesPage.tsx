import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { useDownload } from "../../api/useDownload.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatAge } from "../../lib/dates.ts";
import { useDebounced } from "../../lib/useDebounced.ts";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError, loadErrorMessage } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { TextField } from "../../ui/TextField.tsx";
import { addedText } from "../customers/CustomerPicker.tsx";
import {
  type CustomerFieldValues,
  CustomerFields,
  EMPTY_CUSTOMER,
  newCustomerBody,
} from "../customers/CustomerFields.tsx";
import { type DuesRow, useDues } from "../customers/useDues.ts";
import { useCreateCustomer, useCustomerList } from "../customers/useCustomers.ts";
import styles from "./DuesPage.module.css";

const BUCKETS = [
  { key: "0-7", label: "Up to a week" },
  { key: "8-30", label: "8 to 30 days" },
  { key: "31-90", label: "1 to 3 months" },
  { key: "90+", label: "Over 3 months" },
] as const;

type Tab = "owing" | "all";

export function DuesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "all" ? "all" : "owing";
  const [adding, setAdding] = useState(false);
  const download = useDownload();

  return (
    <>
      <PageHeader
        title="Dues and customers"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(true);
              }}
            >
              Add customer
            </Button>
            <ButtonLink to="/new/payment">Payment received</ButtonLink>
          </>
        }
      />
      <div className={styles.tabs} role="group" aria-label="Show">
        {(
          [
            ["owing", "Who owes"],
            ["all", "All customers"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            className={styles.tab}
            onClick={() => {
              setParams(value === "all" ? { tab: "all" } : {}, { replace: true });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "owing" ? (
        <Owing
          onDownload={() => {
            download.mutate({ path: "/dues/export" });
          }}
          downloading={download.isPending}
        />
      ) : (
        <AllCustomers />
      )}
      {download.isError ? <ErrorNotice>{loadErrorMessage(download.error)}</ErrorNotice> : null}
      <AddCustomerSheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
      />
    </>
  );
}

function Owing({ onDownload, downloading }: { onDownload: () => void; downloading: boolean }) {
  const dues = useDues();
  if (dues.isError) return <LoadError error={dues.error} onRetry={() => void dues.refetch()} />;
  if (!dues.data) return <Loading what="dues" />;
  const owing = dues.data.customers.filter((row) => row.balancePaise > 0);
  const total = dues.data.totals.balancePaise;

  return (
    <>
      <section className={styles.summary} aria-label="Dues by age">
        <div className={styles.total}>
          <span className={styles.totalLabel}>Customers owe</span>
          <span className={styles.totalFigure}>
            <Money paise={total} tone={total > 0 ? "owed" : "plain"} />
          </span>
        </div>
        <dl className={styles.buckets}>
          {BUCKETS.map((bucket) => (
            <div key={bucket.key} className={styles.bucket} data-bucket={bucket.key}>
              <dt>{bucket.label}</dt>
              <dd>
                <Money paise={dues.data.totals.byBucket[bucket.key] ?? 0} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className={styles.listHead}>
        <h2 className={styles.subhead}>
          {owing.length === 1 ? "1 customer owes" : `${String(owing.length)} customers owe`}
        </h2>
        <Button variant="quiet" onClick={onDownload} disabled={downloading}>
          {downloading ? "Preparing…" : "Download"}
        </Button>
      </div>
      <Register label="Customers who owe">
        {owing.length === 0 ? (
          <RegisterRow label="Nobody owes anything." />
        ) : (
          owing.map((row) => <DuesLine key={row.customer.id} row={row} />)
        )}
      </Register>
    </>
  );
}

function DuesLine({ row }: { row: DuesRow }) {
  const detail = [
    `Oldest due ${formatAge(row.ageDays)}`,
    row.hasUnappliedCredit ? "has credit to apply" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <RegisterLink
      to={`/dues/${String(row.customer.id)}`}
      label={row.customer.name}
      detail={detail}
      amount={<Money paise={row.balancePaise} tone="owed" />}
    />
  );
}

function AllCustomers() {
  const [term, setTerm] = useState("");
  const [inactive, setInactive] = useState(false);
  const list = useCustomerList(useDebounced(term.trim(), 250), inactive);
  const dues = useDues();
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const balanceOf = (id: number) => dues.data?.customers.find((row) => row.customer.id === id);

  return (
    <>
      <div className={styles.searchRow}>
        <TextField
          label="Find a customer"
          type="search"
          placeholder="Name, village or phone"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
          }}
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={inactive}
            onChange={(event) => {
              setInactive(event.target.checked);
            }}
          />
          Include inactive
        </label>
      </div>
      {list.isPending ? <Loading what="customers" /> : null}
      {list.isError ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data ? (
        <Register label="Customers">
          {rows.length === 0 ? (
            <RegisterRow label={term ? "No customer matches that." : "No customers yet."} />
          ) : (
            rows.map((customer) => {
              const balance = balanceOf(customer.id);
              return (
                <RegisterLink
                  key={customer.id}
                  to={`/dues/${String(customer.id)}`}
                  label={customer.isActive ? customer.name : `${customer.name} (inactive)`}
                  detail={
                    [customer.village, customer.phone].filter(Boolean).join(", ") || undefined
                  }
                  amount={
                    balance && balance.balancePaise > 0 ? (
                      <Money paise={balance.balancePaise} tone="owed" />
                    ) : balance && balance.creditPaise > 0 ? (
                      <Money paise={balance.creditPaise} tone="received" />
                    ) : undefined
                  }
                />
              );
            })
          )}
        </Register>
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading…" : "Show more"}
        </Button>
      ) : null}
    </>
  );
}

function AddCustomerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [values, setValues] = useState<CustomerFieldValues>(EMPTY_CUSTOMER);
  const create = useCreateCustomer();
  const toast = useToast();
  const navigate = useNavigate();
  const errors = fieldErrors(create.error);
  const close = () => {
    setValues(EMPTY_CUSTOMER);
    create.reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Add customer">
      <div className={sheetStyles.body}>
        <FormError error={create.error} shownFields={["name", "phone", "village", "notes"]} />
        <CustomerFields values={values} errors={errors} onChange={setValues} withNotes />
        <Button
          block
          disabled={create.isPending || values.name.trim() === ""}
          onClick={() => {
            create.mutate(newCustomerBody(values), {
              onSuccess: ({ customer, possibleDuplicates }) => {
                toast(addedText(customer.name, possibleDuplicates));
                close();
                void navigate(`/dues/${String(customer.id)}`);
              },
            });
          }}
        >
          {create.isPending ? "Adding…" : "Add customer"}
        </Button>
      </div>
    </Sheet>
  );
}
