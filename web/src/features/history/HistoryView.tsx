import { todayIso } from "../../lib/dates.ts";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Register, RegisterLink, RegisterRow } from "../../ui/Register.tsx";
import { ShowMore } from "../../ui/ShowMore.tsx";
import type { HistoryKind } from "./historyKinds.ts";
import { changeLines, formatMoment } from "./historyText.ts";
import { type AuditAction, type AuditEntry, useHistory } from "./useHistory.ts";

const ACTION_WORDS: Record<AuditAction, string> = {
  CREATE: "Added",
  UPDATE: "Changed",
  DELETE: "Deleted",
  RESTORE: "Restored",
};

/** Every change to one kind of entry, newest first, with what each edit changed. */
export function HistoryView({ kind }: { kind: HistoryKind }) {
  const today = todayIso(new Date());
  const history = useHistory(kind.value);
  if (history.isError)
    return <LoadError error={history.error} onRetry={() => void history.refetch()} />;
  if (!history.data) return <Loading what="the history" />;
  // Pages are counted from the newest, so a change saved while reading shifts the next page by
  // one and repeats a row; each is shown once.
  const rows = [
    ...new Map(
      history.data.pages.flatMap((page) => page.items).map((entry) => [entry.id, entry]),
    ).values(),
  ];
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
            kind.link && !(kind.removedOnDelete && entry.action === "DELETE") ? (
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
