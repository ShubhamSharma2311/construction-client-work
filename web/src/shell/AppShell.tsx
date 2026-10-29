import { useState } from "react";
import { Outlet } from "react-router";
import { formatDayLabel } from "../lib/dates.ts";
import { ErrorNotice } from "../ui/Notice.tsx";
import styles from "./AppShell.module.css";
import { NewEntryDialog } from "./NewEntryDialog.tsx";
import { SideNav } from "./SideNav.tsx";
import { TabBar } from "./TabBar.tsx";
import { useBusinessName } from "./useBusinessName.ts";

/**
 * Phones get a top bar and bottom tabs; tablets and computers get the side menu. Both are
 * rendered and CSS shows one, so nothing jumps while the screen is resized or rotated.
 */
export function AppShell() {
  const { name: businessName, failed: settingsFailed } = useBusinessName();
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const openNewEntry = () => {
    setNewEntryOpen(true);
  };

  return (
    <div className={styles.shell}>
      <div className={styles.side}>
        <SideNav businessName={businessName} onNewEntry={openNewEntry} />
      </div>
      <div className={styles.column}>
        <header className={styles.topBar}>
          <span className={styles.name}>{businessName}</span>
          <span className={styles.day}>{formatDayLabel(new Date())}</span>
        </header>
        <main className={styles.main}>
          {settingsFailed ? (
            <ErrorNotice>
              Could not load the business settings. Check the connection, then reload.
            </ErrorNotice>
          ) : null}
          <Outlet />
        </main>
      </div>
      <div className={styles.tabs}>
        <TabBar onNewEntry={openNewEntry} />
      </div>
      <NewEntryDialog
        open={newEntryOpen}
        onClose={() => {
          setNewEntryOpen(false);
        }}
      />
    </div>
  );
}
