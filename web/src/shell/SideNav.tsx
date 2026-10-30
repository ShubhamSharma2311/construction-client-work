import { NavLink } from "react-router";
import { formatDayLabel } from "../lib/dates.ts";
import { ErrorNotice } from "../ui/Notice.tsx";
import { NAV_GROUPS } from "./nav.ts";
import styles from "./SideNav.module.css";
import { useSignOut } from "./useSignOut.ts";

export function SideNav({
  businessName,
  onNewEntry,
}: {
  businessName: string;
  onNewEntry: () => void;
}) {
  const { signOut, pending, errorMessage } = useSignOut();
  return (
    <aside className={styles.side}>
      <div className={styles.brand}>
        <span className={styles.name}>{businessName}</span>
        <span className={styles.day}>{formatDayLabel(new Date())}</span>
      </div>
      <button type="button" className={styles.newEntry} onClick={onNewEntry}>
        + New entry
      </button>
      <nav aria-label="Main" className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.items[0]?.to} className={styles.group}>
            {group.label ? <span className={styles.groupLabel}>{group.label}</span> : null}
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={styles.link}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.foot}>
        {errorMessage ? <ErrorNotice>{errorMessage}</ErrorNotice> : null}
        <button type="button" className={styles.signOut} onClick={signOut} disabled={pending}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
