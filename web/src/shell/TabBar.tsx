import { NavLink } from "react-router";
import { type Destination, PHONE_TABS } from "./nav.ts";
import styles from "./TabBar.module.css";

function Tab({ to, label }: Destination) {
  return (
    <NavLink to={to} end={to === "/"} className={styles.tab}>
      {label}
    </NavLink>
  );
}

export function TabBar({ onNewEntry }: { onNewEntry: () => void }) {
  return (
    <nav aria-label="Tabs" className={styles.bar}>
      {PHONE_TABS.before.map((tab) => (
        <Tab key={tab.to} {...tab} />
      ))}
      <button type="button" className={styles.newEntry} onClick={onNewEntry}>
        + New
      </button>
      {PHONE_TABS.after.map((tab) => (
        <Tab key={tab.to} {...tab} />
      ))}
    </nav>
  );
}
