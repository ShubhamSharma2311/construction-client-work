import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import styles from "./EntryTable.module.css";

/**
 * Where a column goes on a phone, where each row becomes a register line: title (top
 * left, the row's link), amount (top right), status (under the amount), or hidden. The
 * line under the title comes from `phoneMeta`, since one line there sums up several columns.
 */
export type PhoneSlot = "title" | "amount" | "status" | "hidden";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  phone: PhoneSlot;
  /** Amount columns line up on the right. */
  numeric?: boolean;
  /** The first column carries the register's red margin, as dates do in a paper register. */
  margin?: boolean;
}

export interface EntryTableProps<T> {
  caption: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  rowLink: (row: T) => string;
  /** Text inside the title cell's link; screen readers read it as the row's name. */
  rowLabel: (row: T) => string;
  /** The small line under the title on a phone, e.g. "28 Oct, Suresh, Ladnun road". */
  phoneMeta: (row: T) => ReactNode;
  empty: ReactNode;
}

/** A table on tablets and computers; a ruled list of entries on a phone. */
export function EntryTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  rowLink,
  rowLabel,
  phoneMeta,
  empty,
}: EntryTableProps<T>) {
  const navigate = useNavigate();
  if (rows.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${column.numeric ? styles.numeric : ""} ${column.margin ? styles.margin : ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={styles.row}
              // The title cell's link is what keyboards and screen readers use; a click
              // anywhere else on the row goes to the same place.
              onClick={(event) => {
                if (!(event.target instanceof Element) || !event.target.closest("a")) {
                  void navigate(rowLink(row));
                }
              }}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`${styles[column.phone]} ${column.numeric ? styles.numeric : ""} ${
                    column.margin ? styles.margin : ""
                  }`}
                >
                  {column.phone === "title" ? (
                    <Link to={rowLink(row)} className={styles.link} aria-label={rowLabel(row)}>
                      {column.cell(row)}
                    </Link>
                  ) : (
                    column.cell(row)
                  )}
                </td>
              ))}
              <td className={styles.phoneMeta}>{phoneMeta(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
