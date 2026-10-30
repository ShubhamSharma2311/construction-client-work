import { Link, useSearchParams } from "react-router";
import type { Dashboard } from "../../api/types.ts";
import {
  daysBetween,
  formatAge,
  formatDate,
  formatFullDate,
  isIsoDate,
  type IsoDate,
  todayIso,
} from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { DateField } from "../../ui/DateField.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { PageHeader } from "../../ui/PageHeader.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "../expenses/categories.ts";
import { SetupPrompt } from "../settings/SetupPrompt.tsx";
import { useSettings } from "../settings/useSettings.ts";
import styles from "./TodayPage.module.css";
import { useDashboard } from "./useDashboard.ts";

export function TodayPage() {
  const settings = useSettings();
  if (settings.data === null) {
    return (
      <>
        <PageHeader title="Today" />
        <SetupPrompt />
      </>
    );
  }
  // The frame already reports a failed settings load; until settings arrive there is no
  // start date to bound the day picker with.
  if (!settings.data) return <PageHeader title="Today" />;
  return <DayView startDate={settings.data.businessStartDate} />;
}

function DayView({ startDate }: { startDate: IsoDate }) {
  const today = todayIso(new Date());
  const [params, setParams] = useSearchParams();
  const asked = params.get("date") ?? "";
  const inRange = (date: string) => isIsoDate(date) && date >= startDate && date <= today;
  const day = inRange(asked) ? asked : today;
  const dashboard = useDashboard(day);

  return (
    <>
      <PageHeader
        title={day === today ? "Today" : formatFullDate(day)}
        actions={
          <div className={styles.dayPicker}>
            <DateField
              label="Day"
              value={day}
              min={startDate}
              max={today}
              onChange={(next) => {
                // Typing a year passes through dates like 0002-10-28; skip those, and replace
                // the address so Back leaves the screen instead of replaying each keystroke.
                if (next !== "" && !inRange(next)) return;
                setParams(next === today || next === "" ? {} : { date: next }, { replace: true });
              }}
            />
          </div>
        }
      />
      {dashboard.isPending ? <Loading what="the day" /> : null}
      {dashboard.isError ? (
        <LoadError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : null}
      {dashboard.data ? <DayFigures data={dashboard.data} today={today} /> : null}
    </>
  );
}

function DayFigures({ data, today }: { data: Dashboard; today: IsoDate }) {
  const { day } = data;
  const isToday = data.date === today;
  const collected = day.cashInPaise + day.onlineInPaise;
  const spentOn = EXPENSE_CATEGORIES.filter(
    (category) => (data.expensesByCategory[category] ?? 0) > 0,
  )
    .map(
      (category) =>
        `${EXPENSE_CATEGORY_LABELS[category]} ${formatRupees(data.expensesByCategory[category] ?? 0)}`,
    )
    .join(", ");

  return (
    <div className={styles.layout}>
      <section className={styles.money} aria-label="Money in hand">
        <div className={styles.closing}>
          <span className={styles.closingLabel}>Cash in hand</span>
          {/* Short of cash means entries are missing or wrong, so it is shown in red. */}
          <span className={`${styles.figure} ${data.cashInHandPaise < 0 ? styles.short : ""}`}>
            {data.cashInHandPaise < 0 ? "−" : ""}
            <span className={styles.rupee}>₹</span>
            {formatRupees(Math.abs(data.cashInHandPaise), { symbol: false })}
          </span>
          <span className={styles.closingNote}>
            {isToday
              ? "With every entry made so far today"
              : `At the end of ${formatDate(data.date, today)}`}
          </span>
        </div>
        <dl className={styles.pair}>
          <div>
            <dt>Online balance</dt>
            <dd>
              <Money
                paise={data.onlineBalancePaise}
                tone={data.onlineBalancePaise < 0 ? "owed" : "plain"}
              />
            </dd>
          </div>
          <div>
            {/* The API gives dues as they stand now, whichever day is on screen. */}
            <dt>{isToday ? "Customers owe" : "Customers owe now"}</dt>
            <dd>
              <Money
                paise={data.totalDuesPaise}
                tone={data.totalDuesPaise > 0 ? "owed" : "plain"}
              />
            </dd>
          </div>
        </dl>

        <h2 className={styles.subhead}>{isToday ? "Entries today" : "Entries that day"}</h2>
        <Register label="The day's entries">
          <RegisterRow
            label="Trips"
            detail={`${String(day.trips)} ${day.trips === 1 ? "trip" : "trips"}`}
            amount={<Money paise={day.revenuePaise} />}
          />
          <RegisterRow
            label="Collected from customers"
            detail={`${formatRupees(day.cashInPaise)} cash, ${formatRupees(day.onlineInPaise)} online${
              day.duesRecoveredPaise > 0
                ? `, ${formatRupees(day.duesRecoveredPaise)} of it old dues or advances`
                : ""
            }`}
            amount={<Money paise={collected} tone={collected > 0 ? "received" : "plain"} />}
          />
          <RegisterRow
            label="Left as due"
            amount={
              <Money paise={day.newDuesPaise} tone={day.newDuesPaise > 0 ? "owed" : "plain"} />
            }
          />
          <RegisterRow
            label="Spent"
            detail={spentOn || undefined}
            amount={<Money paise={day.expensesPaise} />}
          />
          <RegisterRow label="Paid to drivers" amount={<Money paise={day.driverPaymentsPaise} />} />
          {day.partnerNetPaidPaise === 0 ? null : (
            <RegisterRow
              label={day.partnerNetPaidPaise > 0 ? "Paid to partner" : "Received from partner"}
              amount={<Money paise={Math.abs(day.partnerNetPaidPaise)} />}
            />
          )}
        </Register>
      </section>

      <section className={styles.side} aria-label="Needs attention">
        {data.overdueEmis > 0 ? (
          <Register label="Overdue EMIs">
            <RegisterLink
              to="/tractors"
              label={
                <span
                  className={styles.alert}
                >{`${String(data.overdueEmis)} EMI${data.overdueEmis === 1 ? "" : "s"} overdue`}</span>
              }
              detail="Open Tractors and EMI to pay"
            />
          </Register>
        ) : null}
        <div className={styles.subheadRow}>
          <h2 className={styles.subhead}>To collect</h2>
          <Link to="/dues" className={styles.more}>
            All dues
          </Link>
        </div>
        <Register label="Customers who owe the most">
          {data.topDues.length === 0 ? (
            <RegisterRow label="Nobody owes anything." />
          ) : (
            data.topDues.map((row) => (
              <RegisterLink
                key={row.customer.id}
                to={`/dues/${String(row.customer.id)}`}
                label={row.customer.name}
                detail={`Oldest due ${formatAge(daysBetween(row.oldestDueDate, today))}`}
                amount={<Money paise={row.balancePaise} tone="owed" />}
              />
            ))
          )}
        </Register>
      </section>
    </div>
  );
}
