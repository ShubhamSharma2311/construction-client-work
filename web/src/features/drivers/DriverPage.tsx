import { useState } from "react";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, formatMonth, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import type { DateRange } from "../../lib/ranges.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { Register, RegisterRow } from "../../ui/Register.tsx";
import { ShowMore } from "../../ui/ShowMore.tsx";
import { Tag } from "../../ui/Tag.tsx";
import { useSettings } from "../settings/useSettings.ts";
import styles from "./DriverPage.module.css";
import {
  Bonus,
  CloseMonth,
  DriverOpening,
  EditDriver,
  RemoveDriverOpening,
  SalaryRates,
  serviceDates,
} from "./DriverSheets.tsx";
import { driverStanding, entryChange, entryText } from "./driverText.ts";
import {
  type DriverDetail,
  type DriverLedger,
  type DriverPayment,
  useDeleteDriverPayment,
  useDriver,
  useDriverLedger,
  useDriverPayments,
} from "./useDriver.ts";

type Entry = DriverLedger["entries"][number];
type MonthLine = DriverLedger["months"][number];

const PAYMENT_LABELS = { ADVANCE: "Advance", SALARY: "Salary", BONUS: "Bonus" } as const;

export function DriverPage({ id }: { id: number }) {
  const driver = useDriver(id);
  if (driver.isError)
    return <LoadError error={driver.error} onRetry={() => void driver.refetch()} />;
  if (!driver.data) return <Loading what="the driver" />;
  return <Driver driver={driver.data} />;
}

type SheetName = "close" | "bonus" | "edit" | "salary" | "opening" | "removeOpening";

function Driver({ driver }: { driver: DriverDetail }) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const balance = useDriverLedger(driver.id, null);
  const settings = useSettings();
  const close = () => {
    setSheet(null);
  };
  const opener = (name: SheetName) => () => {
    setSheet(name);
  };
  const hasOpening =
    balance.data?.entries.some((entry) => entry.type === "OPENING_BALANCE") ?? true;

  return (
    <>
      <PageHeader
        title={driver.name}
        actions={driver.isActive ? null : <Tag tone="quiet">Inactive</Tag>}
      />
      {balance.isError ? (
        <LoadError error={balance.error} onRetry={() => void balance.refetch()} />
      ) : null}
      {balance.data ? (
        <Standing name={driver.name} balancePaise={balance.data.closingBalancePaise} />
      ) : null}
      <DetailList>
        <Detail label="Salary">
          <span>
            <Money paise={driver.currentMonthlyPaise ?? 0} /> a month
          </span>
        </Detail>
        <Detail label="Usual tractor">{driver.defaultTractor?.regNumber ?? "None"}</Detail>
        <Detail label="Service">{serviceDates(driver)}</Detail>
        {driver.phone ? (
          <Detail label="Phone">
            <a href={`tel:+91${driver.phone}`}>{driver.phone}</a>
          </Detail>
        ) : null}
      </DetailList>
      <div className={actions.actions}>
        <ButtonLink to={`/new/driver-payment?driver=${String(driver.id)}`}>
          Pay {driver.name}
        </ButtonLink>
        <Button variant="secondary" onClick={opener("close")}>
          Close a month
        </Button>
        <Button variant="secondary" onClick={opener("bonus")}>
          Bonus
        </Button>
        <Button variant="secondary" onClick={opener("salary")}>
          Salary
        </Button>
        <Button variant="secondary" onClick={opener("edit")}>
          Edit details
        </Button>
        {hasOpening ? (
          <Button variant="secondary" onClick={opener("removeOpening")}>
            Remove old balance
          </Button>
        ) : (
          <Button variant="secondary" onClick={opener("opening")}>
            Old register balance
          </Button>
        )}
      </div>
      {settings.data ? (
        <Account driverId={driver.id} startDate={settings.data.businessStartDate} />
      ) : null}
      <Payments driver={driver} />
      {sheet === "close" ? <CloseMonth driver={driver} onClose={close} /> : null}
      {sheet === "bonus" ? <Bonus driver={driver} onClose={close} /> : null}
      {sheet === "edit" ? <EditDriver driver={driver} onClose={close} /> : null}
      {sheet === "salary" ? <SalaryRates driver={driver} onClose={close} /> : null}
      {sheet === "opening" ? <DriverOpening driver={driver} onClose={close} /> : null}
      {sheet === "removeOpening" ? <RemoveDriverOpening driver={driver} onClose={close} /> : null}
    </>
  );
}

/** Money the business owes a driver stays plain; an advance the driver holds is owed back, so red. */
function Standing({ name, balancePaise }: { name: string; balancePaise: number }) {
  const { text, owesDriver } = driverStanding(name, balancePaise);
  return (
    <p className={`${styles.standing} ${owesDriver === false ? styles.advance : ""}`}>{text}</p>
  );
}

function Account({ driverId, startDate }: { driverId: number; startDate: IsoDate }) {
  const today = todayIso(new Date());
  const [range, setRange] = useState<DateRange | null>(null);
  const ledger = useDriverLedger(driverId, range);

  const monthColumns: Column<MonthLine>[] = [
    {
      key: "month",
      header: "Month",
      cell: (line) => formatMonth(line.month),
      phone: "title",
      margin: true,
    },
    {
      key: "earned",
      header: "Earned",
      cell: (line) => <Money paise={line.earnedPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "paid",
      header: "Paid",
      cell: (line) => <Money paise={line.paidPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "balance",
      header: "Balance at month end",
      cell: (line) => <Money paise={line.closingBalancePaise} />,
      phone: "amount",
      numeric: true,
    },
  ];
  const entryColumns: Column<Entry>[] = [
    {
      key: "date",
      header: "Date",
      cell: (entry) => formatDate(entry.date, today),
      phone: "hidden",
      margin: true,
    },
    { key: "entry", header: "Entry", cell: entryText, phone: "title" },
    {
      key: "earned",
      header: "Earned",
      cell: (entry) => (entry.earnedPaise ? <Money paise={entry.earnedPaise} /> : ""),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "paid",
      header: "Paid",
      cell: (entry) => (entry.paidPaise ? <Money paise={entry.paidPaise} /> : ""),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "change",
      header: "",
      cell: (entry) => entryChange(entry.earnedPaise, entry.paidPaise),
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
    <section className={styles.section} aria-label="Account">
      <h2 className={styles.subhead}>Account</h2>
      <RangeChips value={range} onChange={setRange} today={today} startDate={startDate} />
      {ledger.isError ? (
        <LoadError error={ledger.error} onRetry={() => void ledger.refetch()} />
      ) : null}
      {ledger.isPending ? <Loading what="the account" /> : null}
      {ledger.data ? (
        <>
          <EntryTable
            caption="Month by month"
            rows={ledger.data.months}
            columns={monthColumns}
            rowKey={(line) => line.month}
            phoneMeta={(line) =>
              `Earned ${formatRupees(line.earnedPaise)}, paid ${formatRupees(line.paidPaise)}`
            }
            empty="Nothing earned or paid in these dates."
          />
          <EntryTable
            caption="Every entry"
            rows={ledger.data.entries}
            columns={entryColumns}
            rowKey={(entry) => `${entry.type}-${String(entry.refId)}`}
            phoneMeta={(entry) => formatDate(entry.date, today)}
            empty="No entries in these dates."
          />
        </>
      ) : null}
    </section>
  );
}

function Payments({ driver }: { driver: DriverDetail }) {
  const today = todayIso(new Date());
  const payments = useDriverPayments(driver.id);
  const [undoing, setUndoing] = useState<DriverPayment | null>(null);
  const first = payments.data?.pages[0];
  const rows = payments.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className={styles.section} aria-label="Payments">
      <h2 className={styles.subhead}>Payments</h2>
      {payments.isError ? (
        <LoadError error={payments.error} onRetry={() => void payments.refetch()} />
      ) : null}
      {payments.isPending ? <Loading what="payments" /> : null}
      {payments.data ? (
        <Register label="Payments">
          {rows.length === 0 ? (
            <RegisterRow label={`Nothing paid to ${driver.name} yet.`} />
          ) : (
            rows.map((payment) => (
              <RegisterRow
                key={payment.id}
                label={PAYMENT_LABELS[payment.type]}
                detail={[
                  formatDate(payment.paidOn, today),
                  payment.forMonth ? `for ${formatMonth(payment.forMonth)}` : null,
                  payment.mode === "ONLINE" ? "online" : "cash",
                  payment.notes,
                ]
                  .filter(Boolean)
                  .join(", ")}
                amount={<Money paise={payment.amountPaise} />}
                action={
                  <Button
                    variant="quiet"
                    aria-label={`Undo ${PAYMENT_LABELS[payment.type].toLowerCase()} of ${formatRupees(payment.amountPaise)} on ${formatDate(payment.paidOn, today)}`}
                    onClick={() => {
                      setUndoing(payment);
                    }}
                  >
                    Undo
                  </Button>
                }
              />
            ))
          )}
        </Register>
      ) : null}
      {payments.hasNextPage ? (
        <ShowMore
          shown={rows.length}
          total={first?.total ?? rows.length}
          loading={payments.isFetchingNextPage}
          onMore={() => void payments.fetchNextPage()}
        />
      ) : null}
      {undoing ? (
        <UndoPayment
          driver={driver}
          payment={undoing}
          onClose={() => {
            setUndoing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function UndoPayment({
  driver,
  payment,
  onClose,
}: {
  driver: DriverDetail;
  payment: DriverPayment;
  onClose: () => void;
}) {
  const remove = useDeleteDriverPayment();
  const toast = useToast();
  return (
    <ConfirmDialog
      open
      title={`Undo this ${PAYMENT_LABELS[payment.type].toLowerCase()}?`}
      confirmLabel="Undo payment"
      busy={remove.isPending}
      error={remove.isError ? saveErrorMessage(remove.error) : null}
      onClose={onClose}
      onConfirm={() => {
        remove.mutate(payment.id, {
          onSuccess: (result) => {
            toast(`Payment undone. ${driverStanding(driver.name, result.balancePaise).text}.`);
            onClose();
          },
        });
      }}
    >
      <p className={actions.text}>{undoText(driver.name, payment)}</p>
    </ConfirmDialog>
  );
}

/** What undoing a payment does to the account depends on what it was. */
function undoText(name: string, payment: DriverPayment): string {
  const amount = formatRupees(payment.amountPaise);
  if (payment.type === "BONUS") {
    return `The ${amount} bonus is removed as earned and as paid, so what ${name} is owed stays the same.`;
  }
  return `The ${amount} comes off the cash book, and ${name} is owed ${amount} more.`;
}
