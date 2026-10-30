import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { fieldErrors } from "../../api/errors.ts";
import { useToast } from "../../app/Toast.tsx";
import { formatDate, formatMonth, todayIso } from "../../lib/dates.ts";
import actions from "../../ui/Actions.module.css";
import { Button } from "../../ui/Button.tsx";
import { ButtonLink } from "../../ui/ButtonLink.tsx";
import { DateField } from "../../ui/DateField.tsx";
import { Detail, DetailList } from "../../ui/DetailList.tsx";
import { FilterCheckbox } from "../../ui/FilterPanel.tsx";
import { FormError } from "../../ui/FormError.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { MoneyField } from "../../ui/MoneyField.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import sheetStyles from "../../ui/Sheet.module.css";
import { Tag } from "../../ui/Tag.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { checkLoan, EMPTY_LOAN, loanBody, type LoanValues } from "./loanForm.ts";
import { TractorFields, type TractorValues } from "./TractorFields.tsx";
import styles from "./TractorsPage.module.css";
import { useCreateLoan, useLoans } from "./useLoans.ts";
import {
  type TractorDetail,
  useServiceHistory,
  useTractor,
  useUpdateTractor,
} from "./useTractor.ts";

export function TractorPage({ id }: { id: number }) {
  const tractor = useTractor(id);
  if (tractor.isError)
    return <LoadError error={tractor.error} onRetry={() => void tractor.refetch()} />;
  if (!tractor.data) return <Loading what="the tractor" />;
  return <Tractor tractor={tractor.data} />;
}

type SheetName = "edit" | "loan";

function Tractor({ tractor }: { tractor: TractorDetail }) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const close = () => {
    setSheet(null);
  };
  return (
    <>
      <PageHeader
        title={tractor.regNumber}
        actions={tractor.isActive ? null : <Tag tone="quiet">Inactive</Tag>}
      />
      <DetailList>
        <Detail label="Known as">{tractor.label}</Detail>
        <Detail label="Usual driver">
          {tractor.defaultDriver?.name ?? "None yet; set it on the driver"}
        </Detail>
      </DetailList>
      <div className={actions.actions}>
        <ButtonLink to={`/new/service?tractor=${String(tractor.id)}`}>Record service</ButtonLink>
        <Button
          variant="secondary"
          onClick={() => {
            setSheet("loan");
          }}
        >
          Add loan
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setSheet("edit");
          }}
        >
          Edit details
        </Button>
      </div>
      <Loans tractorId={tractor.id} />
      <Services tractorId={tractor.id} />
      {sheet === "edit" ? <EditTractor tractor={tractor} onClose={close} /> : null}
      {sheet === "loan" ? <AddLoan tractor={tractor} onClose={close} /> : null}
    </>
  );
}

function Loans({ tractorId }: { tractorId: number }) {
  const loans = useLoans();
  if (loans.isError) return <LoadError error={loans.error} onRetry={() => void loans.refetch()} />;
  if (!loans.data) return <Loading what="loans" />;
  const own = loans.data.filter((loan) => loan.tractor.id === tractorId);
  return (
    <section className={styles.section} aria-label="Loans">
      <h2 className={styles.subhead}>Loans</h2>
      <Register label="Loans">
        {own.length === 0 ? (
          <RegisterRow label="No loans on this tractor." />
        ) : (
          own.map((loan) => (
            <RegisterLink
              key={loan.id}
              to={`/loans/${String(loan.id)}`}
              label={loan.lender}
              detail={
                loan.closedOn
                  ? `Closed, ${String(loan.summary.paidCount)} of ${String(loan.totalInstallments)} EMIs paid`
                  : `${String(loan.summary.paidCount)} of ${String(loan.totalInstallments)} EMIs paid${
                      loan.summary.overdueCount > 0
                        ? `, ${String(loan.summary.overdueCount)} overdue`
                        : ""
                    }`
              }
              amount={<Money paise={loan.emiPaise} />}
            />
          ))
        )}
      </Register>
    </section>
  );
}

function Services({ tractorId }: { tractorId: number }) {
  const history = useServiceHistory(tractorId);
  const today = todayIso(new Date());
  if (history.isError)
    return <LoadError error={history.error} onRetry={() => void history.refetch()} />;
  if (!history.data) return <Loading what="service history" />;
  const { lastService, services } = history.data;
  return (
    <section className={styles.section} aria-label="Service history">
      <h2 className={styles.subhead}>Service history</h2>
      {lastService ? (
        <p className={actions.text}>
          Last serviced {formatDate(lastService.date, today)}
          {lastService.hourMeter === null ? "" : ` at ${String(lastService.hourMeter)} hours`}.
        </p>
      ) : null}
      <Register label="Services">
        {services.length === 0 ? (
          <RegisterRow label="No service recorded yet." />
        ) : (
          services.map((service) => (
            <RegisterLink
              key={service.id}
              to={`/expenses/${String(service.id)}`}
              label={service.notes ?? "Service"}
              detail={[
                formatDate(service.spentOn, today),
                service.hourMeter === null ? null : `${String(service.hourMeter)} hours`,
              ]
                .filter(Boolean)
                .join(", ")}
              amount={<Money paise={service.amountPaise} />}
            />
          ))
        )}
      </Register>
    </section>
  );
}

function EditTractor({ tractor, onClose }: { tractor: TractorDetail; onClose: () => void }) {
  const [values, setValues] = useState<TractorValues>({
    regNumber: tractor.regNumber,
    label: tractor.label,
  });
  const [active, setActive] = useState(tractor.isActive);
  const update = useUpdateTractor(tractor.id);
  const toast = useToast();

  const save = () => {
    const changes = {
      ...(values.regNumber.trim() === tractor.regNumber
        ? {}
        : { regNumber: values.regNumber.trim() }),
      ...(values.label.trim() === tractor.label ? {} : { label: values.label.trim() }),
      ...(active === tractor.isActive ? {} : { isActive: active }),
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
        <FormError error={update.error} shownFields={["regNumber", "label"]} />
        <TractorFields values={values} errors={fieldErrors(update.error)} onChange={setValues} />
        <FilterCheckbox
          label="Active (shown when entering trips)"
          checked={active}
          onChange={setActive}
        />
        <Button block onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </Sheet>
  );
}

function AddLoan({ tractor, onClose }: { tractor: TractorDetail; onClose: () => void }) {
  const [values, setValues] = useState<LoanValues>(EMPTY_LOAN);
  const [tried, setTried] = useState(false);
  const create = useCreateLoan(tractor.id);
  const toast = useToast();
  const navigate = useNavigate();
  const problems = tried ? checkLoan(values) : {};
  const server = fieldErrors(create.error);
  const problemOf = (field: keyof LoanValues) => problems[field] ?? server[field];
  const set = (patch: Partial<LoanValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  return (
    <Sheet open onClose={onClose} title={`Loan on ${tractor.regNumber}`}>
      <div className={sheetStyles.body}>
        <FormError
          error={create.error}
          shownFields={[
            "lender",
            "emiAmount",
            "emiDay",
            "firstEmiMonth",
            "totalInstallments",
            "notes",
          ]}
        />
        <TextField
          label="Bank or finance company"
          value={values.lender}
          error={problemOf("lender")}
          onChange={(event) => {
            set({ lender: event.target.value });
          }}
        />
        <MoneyField
          label="EMI amount"
          value={values.emiAmount}
          error={problemOf("emiAmount")}
          onChange={(emiAmount) => {
            set({ emiAmount });
          }}
        />
        <TextField
          label="EMI day of the month"
          inputMode="numeric"
          hint="1 to 28"
          value={values.emiDay}
          error={problemOf("emiDay")}
          onChange={(event) => {
            if (/^\d{0,2}$/.test(event.target.value)) set({ emiDay: event.target.value });
          }}
        />
        <DateField
          label="First EMI month"
          type="month"
          value={values.firstEmiMonth}
          error={problemOf("firstEmiMonth")}
          onChange={(firstEmiMonth) => {
            set({ firstEmiMonth });
          }}
        />
        <TextField
          label="Number of EMIs"
          inputMode="numeric"
          value={values.totalInstallments}
          error={problemOf("totalInstallments")}
          onChange={(event) => {
            if (/^\d{0,3}$/.test(event.target.value))
              set({ totalInstallments: event.target.value });
          }}
        />
        <TextField
          label="Note"
          maxLength={500}
          value={values.notes}
          error={problemOf("notes")}
          onChange={(event) => {
            set({ notes: event.target.value });
          }}
        />
        <Button
          block
          disabled={create.isPending}
          onClick={() => {
            setTried(true);
            if (Object.keys(checkLoan(values)).length > 0) return;
            create.mutate(loanBody(values), {
              onSuccess: (loan) => {
                toast(
                  `Loan from ${loan.lender} added: ${String(loan.totalInstallments)} EMIs from ${formatMonth(loan.firstEmiMonth)}.`,
                );
                void navigate(`/loans/${String(loan.id)}`);
              },
            });
          }}
        >
          {create.isPending ? "Saving…" : "Add loan"}
        </Button>
      </div>
    </Sheet>
  );
}

/** "Tractor EMI" from New entry: pick the loan, then pay on its page. */
export function NewEmiPage() {
  const loans = useLoans();
  const today = todayIso(new Date());
  const running = loans.data?.filter((loan) => loan.closedOn === null) ?? [];
  return (
    <>
      <PageHeader title="Tractor EMI" />
      {loans.isError ? (
        <LoadError error={loans.error} onRetry={() => void loans.refetch()} />
      ) : null}
      {loans.isPending ? <Loading what="loans" /> : null}
      {loans.data ? (
        <Register label="Loans running">
          {running.length === 0 ? (
            <RegisterRow
              label="No loan is running."
              detail={
                <>
                  Add one from the tractor&apos;s page in{" "}
                  <Link to="/tractors">Tractors and EMI</Link>.
                </>
              }
            />
          ) : (
            running.map((loan) => (
              <RegisterLink
                key={loan.id}
                to={`/loans/${String(loan.id)}${loan.summary.nextDue ? `?pay=${loan.summary.nextDue.month}` : ""}`}
                label={`${loan.tractor.regNumber}, ${loan.lender}`}
                detail={
                  loan.summary.nextDue
                    ? `Next: ${formatMonth(loan.summary.nextDue.month)}, due ${formatDate(loan.summary.nextDue.dueDate, today)}`
                    : "All EMIs paid"
                }
                amount={<Money paise={loan.emiPaise} />}
              />
            ))
          )}
        </Register>
      ) : null}
    </>
  );
}
