import { todayIso } from "../../lib/dates.ts";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { ShowMore } from "../../ui/ShowMore.tsx";
import { changeLines, formatMoment } from "./historyText.ts";
import { type AuditAction, type AuditEntry, useHistory } from "./useHistory.ts";

interface Kind {
  value: string;
  label: string;
  noun: string;
  /** Where one entry opens, for kinds that have a screen of their own. */
  link?: (id: string) => string;
  /** There is only ever one, so its number says nothing. */
  single?: boolean;
}

/** Each kind of entry the API keeps history for; the value is the API's name for it. */
export const HISTORY_KINDS = [
  { value: "Trip", label: "Trips", noun: "trip", link: (id) => `/trips/${id}` },
  {
    value: "CustomerPayment",
    label: "Customer payments",
    noun: "payment",
    link: (id) => `/payments/${id}`,
  },
  { value: "Expense", label: "Expenses", noun: "expense", link: (id) => `/expenses/${id}` },
  { value: "DriverPayment", label: "Driver payments", noun: "driver payment" },
  { value: "DriverAccrual", label: "Driver salary and bonuses", noun: "salary entry" },
  { value: "PartnerTxn", label: "Partner money", noun: "partner entry" },
  { value: "TractorLoan", label: "Tractor loans", noun: "loan", link: (id) => `/loans/${id}` },
  { value: "Customer", label: "Customers", noun: "customer", link: (id) => `/dues/${id}` },
  { value: "Driver", label: "Drivers", noun: "driver", link: (id) => `/drivers/${id}` },
  { value: "DriverSalaryRate", label: "Salary rates", noun: "salary rate" },
  { value: "Tractor", label: "Tractors", noun: "tractor", link: (id) => `/tractors/${id}` },
  { value: "Khet", label: "Khets", noun: "khet" },
  { value: "Labourer", label: "Labourers", noun: "labourer" },
  { value: "Partner", label: "Partners", noun: "partner", link: (id) => `/partner/${id}` },
  { value: "Setting", label: "Business settings", noun: "settings", single: true },
] as const satisfies readonly Kind[];

const ACTION_WORDS: Record<AuditAction, string> = {
  CREATE: "Added",
  UPDATE: "Changed",
  DELETE: "Deleted",
  RESTORE: "Restored",
};

/** Every change to one kind of entry, newest first, with what each edit changed. */
export function HistoryView({ kind }: { kind: Kind }) {
  const today = todayIso(new Date());
  const history = useHistory(kind.value);
  if (history.isError)
    return <LoadError error={history.error} onRetry={() => void history.refetch()} />;
  if (!history.data) return <Loading what="the history" />;
  const rows = history.data.pages.flatMap((page) => page.items);
  const total = history.data.pages[0]?.total ?? rows.length;
  const line = (entry: AuditEntry) => ({
    label: `${ACTION_WORDS[entry.action]} ${kind.noun}${kind.single ? "" : ` #${entry.entityId}`}`,
    detail: [
      formatMoment(entry.at, today),
      ...changeLines(entry.action, entry.before, entry.after, today),
    ].join("; "),
  });

  return (
    <>
      <Register label={`History of ${kind.label.toLowerCase()}`}>
        {rows.length === 0 ? (
          <RegisterRow label={`No ${kind.label.toLowerCase()} changed yet.`} />
        ) : (
          rows.map((entry) =>
            kind.link ? (
              <RegisterLink key={entry.id} to={kind.link(entry.entityId)} {...line(entry)} />
            ) : (
              <RegisterRow key={entry.id} {...line(entry)} />
            ),
          )
        )}
      </Register>
      {history.hasNextPage ? (
        <ShowMore
          shown={rows.length}
          total={total}
          loading={history.isFetchingNextPage}
          onMore={() => void history.fetchNextPage()}
        />
      ) : null}
    </>
  );
}
