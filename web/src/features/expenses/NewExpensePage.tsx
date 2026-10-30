import { useState } from "react";
import { renewAfterMismatch, useIdempotencyKey } from "../../api/useIdempotencyKey.ts";
import { useToast } from "../../app/Toast.tsx";
import { type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { EXPENSE_CATEGORY_LABELS } from "./categories.ts";
import { ExpenseForm } from "./ExpenseForm.tsx";
import {
  type EnteredCategory,
  emptyExpense,
  expenseBody,
  type ExpenseValues,
} from "./expenseValues.ts";
import { useCreateExpense } from "./useExpenses.ts";

export interface NewExpensePageProps {
  title: string;
  /** The kinds this entry offers; the first is picked to start with. */
  categories: readonly [EnteredCategory, ...EnteredCategory[]];
}

export function NewExpensePage({ title, categories }: NewExpensePageProps) {
  const settings = useSettings();
  return (
    <>
      <PageHeader title={title} />
      {settings.data === null ? <SetupPrompt /> : null}
      {settings.data ? (
        <NewExpense categories={categories} startDate={settings.data.businessStartDate} />
      ) : null}
    </>
  );
}

function NewExpense({
  categories,
  startDate,
}: Pick<NewExpensePageProps, "categories"> & { startDate: IsoDate }) {
  const today = todayIso(new Date());
  const { key, renew } = useIdempotencyKey();
  const create = useCreateExpense();
  const toast = useToast();
  const [next, setNext] = useState<ExpenseValues>(() => emptyExpense(categories[0], today));
  const [entry, setEntry] = useState(0);

  return (
    <ExpenseForm
      key={entry}
      initial={next}
      categories={categories}
      startDate={startDate}
      today={today}
      submitLabel="Save expense"
      pending={create.isPending}
      error={create.error}
      onSubmit={(values) => {
        create.mutate(
          { body: expenseBody(values), key },
          {
            onSuccess: (saved) => {
              const { expense } = saved;
              toast(
                `${EXPENSE_CATEGORY_LABELS[expense.category]} of ${formatRupees(expense.amountPaise)} saved.`,
              );
              for (const warning of saved.warnings) toast(warning);
              renew();
              // Expenses come in runs too (a day's diesel for each tractor): keep the day,
              // the kind and how it was paid.
              setNext({ ...emptyExpense(values.category, values.spentOn), mode: values.mode });
              setEntry((current) => current + 1);
              create.reset();
            },
            onError: (error) => {
              renewAfterMismatch(error, renew);
            },
          },
        );
      }}
    />
  );
}

export function NewGeneralExpensePage() {
  return (
    <NewExpensePage
      title="New expense"
      categories={["LABOUR", "ROYALTY", "POLICE", "OTHER", "EMERGENCY"]}
    />
  );
}

export function NewDieselPage() {
  return <NewExpensePage title="Diesel" categories={["DIESEL"]} />;
}

export function NewServicePage() {
  return <NewExpensePage title="Tractor service" categories={["TRACTOR_SERVICE"]} />;
}
