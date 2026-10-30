import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { saveErrorMessage } from "../../api/saveErrorMessage.ts";
import type { ExpenseItem } from "../../api/types.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatFullDate, formatMonth, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { ErrorNotice } from "../../ui/Notice.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Tag } from "../../ui/Tag.tsx";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import { EXPENSE_CATEGORY_LABELS } from "./categories.ts";
import { ExpenseForm } from "./ExpenseForm.tsx";
import { type EnteredCategory, expenseChanges, expenseValuesOf } from "./expenseValues.ts";
import {
  useDeleteExpense,
  useExpense,
  useRestoreExpense,
  useUpdateExpense,
} from "./useExpenses.ts";

type EnteredExpense = ExpenseItem & { category: EnteredCategory };

/** EMIs are paid and undone from the tractor's loan, which keeps its schedule right. */
function isEntered(expense: ExpenseItem): expense is EnteredExpense {
  return expense.category !== "TRACTOR_EMI";
}

export function ExpensePage({ id }: { id: number }) {
  const expense = useExpense(id);
  if (expense.isError)
    return <LoadError error={expense.error} onRetry={() => void expense.refetch()} />;
  if (!expense.data) return <Loading what="the expense" />;
  return <ExpenseDetails expense={expense.data} />;
}

function ExpenseDetails({ expense }: { expense: ExpenseItem }) {
  const label = EXPENSE_CATEGORY_LABELS[expense.category];
  return (
    <>
      <PageHeader
        title={label}
        actions={expense.deletedAt ? <Tag tone="quiet">Deleted</Tag> : null}
      />
      <DetailList>
        <Detail label="Date">{formatFullDate(expense.spentOn)}</Detail>
        <Detail label="Amount">
          <Money paise={expense.amountPaise} />
        </Detail>
        <Detail label="Paid by">{expense.mode === "ONLINE" ? "Online" : "Cash"}</Detail>
        {expense.labourer ? <Detail label="Paid to">{expense.labourer.name}</Detail> : null}
        {expense.tractor ? <Detail label="Tractor">{expense.tractor.regNumber}</Detail> : null}
        {expense.driver ? <Detail label="Driver">{expense.driver.name}</Detail> : null}
        {expense.dieselLitres === null ? null : (
          <Detail label="Litres">{`${String(expense.dieselLitres)} L`}</Detail>
        )}
        {expense.hourMeter === null ? null : (
          <Detail label="Hour meter">{expense.hourMeter}</Detail>
        )}
        {expense.emiMonth ? <Detail label="EMI for">{formatMonth(expense.emiMonth)}</Detail> : null}
        {expense.lateFeePaise ? (
          <Detail label="Late fee in it">
            <Money paise={expense.lateFeePaise} />
          </Detail>
        ) : null}
        {expense.periodFrom && expense.periodTo ? (
          <Detail label="Period">{`${formatFullDate(expense.periodFrom)} to ${formatFullDate(expense.periodTo)}`}</Detail>
        ) : null}
        {expense.reference ? <Detail label="Reference">{expense.reference}</Detail> : null}
        {expense.notes ? <Detail label="Note">{expense.notes}</Detail> : null}
      </DetailList>
      {isEntered(expense) ? (
        expense.deletedAt ? (
          <RestoreExpense expense={expense} />
        ) : (
          <ExpenseActions expense={expense} />
        )
      ) : (
        <p className={actions.text}>
          EMIs are paid and undone from the tractor&apos;s loan, which keeps its schedule right.{" "}
          <Link to="/tractors">Open Tractors and EMI</Link>
        </p>
      )}
    </>
  );
}

function ExpenseActions({ expense }: { expense: EnteredExpense }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteExpense(expense.id);
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <div className={actions.actions}>
      <ButtonLink to={`/expenses/${String(expense.id)}/edit`}>Edit expense</ButtonLink>
      <Button
        variant="secondary"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Delete
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Delete this expense?"
        confirmLabel="Delete expense"
        busy={remove.isPending}
        error={remove.isError ? saveErrorMessage(remove.error) : null}
        onClose={() => {
          setConfirming(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove.mutate(undefined, {
            onSuccess: () => {
              toast(
                `${EXPENSE_CATEGORY_LABELS[expense.category]} of ${formatRupees(expense.amountPaise)} deleted.`,
              );
              void navigate("/expenses");
            },
          });
        }}
      >
        <p className={actions.text}>It can be restored later from the deleted expenses.</p>
      </ConfirmDialog>
    </div>
  );
}

function RestoreExpense({ expense }: { expense: EnteredExpense }) {
  const restore = useRestoreExpense(expense.id);
  const toast = useToast();
  return (
    <div className={actions.actions}>
      {restore.isError ? <ErrorNotice>{saveErrorMessage(restore.error)}</ErrorNotice> : null}
      <Button
        disabled={restore.isPending}
        onClick={() => {
          restore.mutate(undefined, {
            onSuccess: () => {
              toast("Expense restored.");
            },
          });
        }}
      >
        {restore.isPending ? "Restoring…" : "Restore expense"}
      </Button>
    </div>
  );
}

export function EditExpensePage({ id }: { id: number }) {
  const expense = useExpense(id);
  const settings = useSettings();
  const update = useUpdateExpense(id);
  const toast = useToast();
  const navigate = useNavigate();

  if (expense.isError)
    return <LoadError error={expense.error} onRetry={() => void expense.refetch()} />;
  if (settings.isError)
    return <LoadError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (settings.data === null) return <SetupPrompt />;
  if (!expense.data || !settings.data) return <Loading what="the expense" />;
  const back = `/expenses/${String(id)}`;
  if (!isEntered(expense.data) || expense.data.deletedAt) {
    return (
      <>
        <PageHeader title="Edit expense" />
        <p>
          {expense.data.deletedAt
            ? "Restore this expense before changing it."
            : "EMIs are changed from the tractor's loan."}{" "}
          <Link to={back}>Back to the expense</Link>
        </p>
      </>
    );
  }

  const before = expenseValuesOf(expense.data);
  return (
    <>
      <PageHeader title={`Edit ${EXPENSE_CATEGORY_LABELS[before.category].toLowerCase()}`} />
      <ExpenseForm
        initial={before}
        categories={[before.category]}
        startDate={settings.data.businessStartDate}
        today={todayIso(new Date())}
        submitLabel="Save changes"
        pending={update.isPending}
        error={update.error}
        onSubmit={(values) => {
          const changes = expenseChanges(before, values);
          if (Object.keys(changes).length === 0) {
            toast("Nothing was changed.");
            void navigate(back);
            return;
          }
          update.mutate(changes, {
            onSuccess: (saved) => {
              toast("Expense updated.");
              for (const warning of saved.warnings) toast(warning);
              void navigate(back);
            },
          });
        }}
      />
    </>
  );
}
