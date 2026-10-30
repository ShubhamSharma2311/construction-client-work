import { useSearchParams } from "react-router";
import type { ExpenseItem } from "../../api/types.ts";
import { useDownload } from "../../api/useDownload.ts";
import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { presetRange } from "../../lib/ranges.ts";
import { asTextQuery } from "../../lib/textQuery.ts";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { Loading, LoadError, loadErrorMessage } from "../../ui/LoadState.tsx";
import { BigTotal } from "../../ui/FigureStrip.tsx";
import { Money } from "../../ui/Money.tsx";
import { FilterCheckbox, FilterPanel } from "../../ui/FilterPanel.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { RangeChips } from "../../ui/RangeChips.tsx";
import { SelectField } from "../../ui/SelectField.tsx";
import { ShowMore } from "../../ui/ShowMore.tsx";
import { Tag } from "../../ui/Tag.tsx";
import { ViewToggle } from "../../ui/ViewToggle.tsx";
import { filterOptions, useDrivers, useLabourers, useTractors } from "../masters/useMasters.ts";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "./categories.ts";
import { DieselReport } from "./DieselReport.tsx";
import {
  type ExpenseFilters,
  expenseQuery,
  PAY_MODES,
  readExpenseFilters,
  writeExpenseFilters,
} from "./expenseFilters.ts";
import styles from "./ExpensesPage.module.css";
import { expenseFor } from "./expenseText.ts";
import { useExpenseList } from "./useExpenses.ts";

const MODE_LABELS = { CASH: "Cash", ONLINE: "Online" } as const;

const VIEWS = [
  { value: "list", label: "All expenses" },
  { value: "diesel", label: "Diesel report" },
] as const;

export function ExpensesPage() {
  const settings = useSettings();
  if (settings.data === null) {
    return (
      <>
        <PageHeader title="Expenses" />
        <SetupPrompt />
      </>
    );
  }
  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!settings.data) return <PageHeader title="Expenses" />;
  return <Expenses startDate={settings.data.businessStartDate} />;
}

function Expenses({ startDate }: { startDate: IsoDate }) {
  const today = todayIso(new Date());
  const [params, setParams] = useSearchParams();
  const diesel = params.get("view") === "diesel";
  const filters = readExpenseFilters(params, presetRange("month", today));
  const setFilters = (next: ExpenseFilters) => {
    setParams(
      { ...writeExpenseFilters(next), ...(diesel ? { view: "diesel" } : {}) },
      { replace: true },
    );
  };
  const showView = (view: "list" | "diesel") => {
    setParams(
      { ...writeExpenseFilters(filters), ...(view === "diesel" ? { view: "diesel" } : {}) },
      { replace: true },
    );
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        actions={<ButtonLink to="/new/expense">New expense</ButtonLink>}
      />
      <ViewToggle options={VIEWS} value={diesel ? "diesel" : "list"} onChange={showView} />
      <RangeChips
        value={filters.range}
        today={today}
        startDate={startDate}
        onChange={(range) => {
          setFilters({ ...filters, range });
        }}
      />
      {diesel ? (
        <DieselReport range={filters.range} />
      ) : (
        <ExpenseList filters={filters} onChange={setFilters} today={today} />
      )}
    </>
  );
}

function ExpenseList({
  filters,
  onChange,
  today,
}: {
  filters: ExpenseFilters;
  onChange: (next: ExpenseFilters) => void;
  today: IsoDate;
}) {
  const list = useExpenseList(filters);
  const download = useDownload();
  const first = list.data?.pages[0];
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  const columns: Column<ExpenseItem>[] = [
    {
      key: "date",
      header: "Date",
      cell: (expense) => formatDate(expense.spentOn, today),
      phone: "hidden",
      margin: true,
    },
    {
      key: "kind",
      header: "Kind",
      cell: (expense) => EXPENSE_CATEGORY_LABELS[expense.category],
      phone: "title",
    },
    { key: "for", header: "For", cell: expenseFor, phone: "hidden" },
    {
      key: "mode",
      header: "Paid by",
      cell: (expense) => MODE_LABELS[expense.mode],
      phone: "hidden",
    },
    {
      key: "amount",
      header: "Amount",
      cell: (expense) => <Money paise={expense.amountPaise} />,
      phone: "amount",
      numeric: true,
    },
    {
      key: "deleted",
      header: "",
      cell: (expense) => (expense.deletedAt ? <Tag tone="quiet">Deleted</Tag> : null),
      phone: "status",
    },
  ];

  return (
    <>
      <Filters filters={filters} onChange={onChange} />
      {first ? (
        <section className={styles.totals} aria-label="Totals">
          <BigTotal label={filters.deleted ? "Deleted" : "Spent"}>
            <Money paise={first.totals.amountPaise} />
          </BigTotal>
          <ul className={styles.byKind} aria-label="Spent by kind">
            {EXPENSE_CATEGORIES.filter(
              (category) => (first.totals.byCategory[category] ?? 0) > 0,
            ).map((category) => (
              <li key={category}>
                {EXPENSE_CATEGORY_LABELS[category]}{" "}
                <strong>{formatRupees(first.totals.byCategory[category] ?? 0)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className={styles.listHead}>
        <Button
          variant="quiet"
          disabled={download.isPending}
          onClick={() => {
            download.mutate({
              path: "/expenses/export",
              query: asTextQuery(expenseQuery(filters)),
            });
          }}
        >
          {download.isPending ? "Preparing…" : "Download"}
        </Button>
      </div>
      {download.isError ? <ErrorNotice>{loadErrorMessage(download.error)}</ErrorNotice> : null}
      {list.isPending ? <Loading what="expenses" /> : null}
      {list.isError ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data ? (
        <EntryTable
          caption="Expenses"
          rows={rows}
          columns={columns}
          rowKey={(expense) => expense.id}
          rowLink={(expense) => `/expenses/${String(expense.id)}`}
          rowLabel={(expense) =>
            `${EXPENSE_CATEGORY_LABELS[expense.category]}, ${formatDate(expense.spentOn, today)}`
          }
          phoneMeta={(expense) =>
            [formatDate(expense.spentOn, today), expenseFor(expense)].filter(Boolean).join(", ")
          }
          empty={filters.range ? "No expenses in these dates." : "No expenses yet."}
        />
      ) : null}
      {list.hasNextPage ? (
        <ShowMore
          shown={rows.length}
          total={first?.total ?? rows.length}
          loading={list.isFetchingNextPage}
          onMore={() => void list.fetchNextPage()}
        />
      ) : null}
    </>
  );
}

function Filters({
  filters,
  onChange,
}: {
  filters: ExpenseFilters;
  onChange: (next: ExpenseFilters) => void;
}) {
  const tractors = useTractors();
  const drivers = useDrivers();
  const labourers = useLabourers();
  const set = (patch: Partial<ExpenseFilters>) => {
    onChange({ ...filters, ...patch });
  };
  const count =
    [
      filters.category,
      filters.tractorId,
      filters.driverId,
      filters.labourerId,
      filters.mode,
    ].filter(Boolean).length + (filters.deleted ? 1 : 0);

  return (
    <FilterPanel count={count}>
      <SelectField
        label="Kind"
        placeholder="All kinds"
        value={filters.category}
        options={EXPENSE_CATEGORIES.map((value) => ({
          value,
          label: EXPENSE_CATEGORY_LABELS[value],
        }))}
        onChange={(value) => {
          set({ category: EXPENSE_CATEGORIES.find((candidate) => candidate === value) ?? "" });
        }}
      />
      <SelectField
        label="Tractor"
        placeholder="All tractors"
        value={filters.tractorId}
        options={filterOptions(tractors.data, (item) => item.regNumber)}
        onChange={(tractorId) => {
          set({ tractorId });
        }}
      />
      <SelectField
        label="Driver"
        placeholder="All drivers"
        value={filters.driverId}
        options={filterOptions(drivers.data, (item) => item.name)}
        onChange={(driverId) => {
          set({ driverId });
        }}
      />
      <SelectField
        label="Labourer"
        placeholder="All labourers"
        value={filters.labourerId}
        options={filterOptions(labourers.data, (item) => item.name)}
        onChange={(labourerId) => {
          set({ labourerId });
        }}
      />
      <SelectField
        label="Paid by"
        placeholder="Cash or online"
        value={filters.mode}
        options={PAY_MODES.map((value) => ({ value, label: MODE_LABELS[value] }))}
        onChange={(value) => {
          set({ mode: PAY_MODES.find((candidate) => candidate === value) ?? "" });
        }}
      />
      <FilterCheckbox
        label="Show deleted expenses only"
        checked={filters.deleted}
        onChange={(deleted) => {
          set({ deleted });
        }}
      />
    </FilterPanel>
  );
}
