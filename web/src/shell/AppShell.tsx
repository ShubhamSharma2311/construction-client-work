import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb.tsx";
import { Separator } from "../components/ui/separator.tsx";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../components/ui/sidebar.tsx";
import { TooltipProvider } from "../components/ui/tooltip.tsx";
import { formatDayLabel } from "../lib/dates.ts";
import { ErrorNotice } from "../ui/Notice.tsx";
import styles from "./AppShell.module.css";
import { sectionOf } from "./nav.ts";
import { NewEntryDialog } from "./NewEntryDialog.tsx";
import { SideNav } from "./SideNav.tsx";
import { TabBar } from "./TabBar.tsx";
import { useBusinessName } from "./useBusinessName.ts";

/**
 * Tablets and computers get shadcn's side menu; phones get bottom tabs, quicker to reach
 * with one thumb. The top bar on every screen says where you are.
 */
export function AppShell() {
  const { name: businessName, failed: settingsFailed } = useBusinessName();
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const { pathname } = useLocation();
  const section = sectionOf(pathname);
  const openNewEntry = () => {
    setNewEntryOpen(true);
  };

  return (
    // The folded side menu names each icon in a tooltip.
    <TooltipProvider>
      <SidebarProvider>
        <SideNav businessName={businessName} onNewEntry={openNewEntry} />
        <SidebarInset className="min-w-0">
          <header className={styles.topBar}>
            <SidebarTrigger className="-ml-1 max-md:hidden" />
            <Separator
              orientation="vertical"
              className="mr-1 max-md:hidden data-[orientation=vertical]:h-4"
            />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="min-w-0">
                  {section ? (
                    <BreadcrumbLink asChild>
                      <Link
                        to="/"
                        className="truncate font-semibold text-foreground md:font-normal md:text-muted-foreground"
                      >
                        {businessName}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="truncate font-semibold">
                      {businessName}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {section ? (
                  <>
                    <BreadcrumbSeparator className="max-md:hidden" />
                    <BreadcrumbItem className="max-md:hidden">
                      <BreadcrumbPage>{section.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
            <span className={styles.day}>{formatDayLabel(new Date())}</span>
          </header>
          {/* SidebarInset is the page's <main>; this only lays the screen out. */}
          <div className={styles.main}>
            {settingsFailed ? (
              <ErrorNotice>
                Could not load the business settings. Check the connection, then reload.
              </ErrorNotice>
            ) : null}
            <Outlet />
          </div>
        </SidebarInset>
        <div className={styles.tabs}>
          <TabBar onNewEntry={openNewEntry} />
        </div>
        <NewEntryDialog
          open={newEntryOpen}
          onClose={() => {
            setNewEntryOpen(false);
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
