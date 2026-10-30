import { LogOut, Plus } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { Avatar, AvatarFallback } from "../components/ui/avatar.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "../components/ui/sidebar.tsx";
import { formatDayLabel } from "../lib/dates.ts";
import { ErrorNotice } from "../ui/Notice.tsx";
import { NAV_GROUPS } from "./nav.ts";
import { useSignOut } from "./useSignOut.ts";

/** The side menu on tablets and computers: shadcn's Sidebar, folding down to icons. */
export function SideNav({
  businessName,
  onNewEntry,
}: {
  businessName: string;
  onNewEntry: () => void;
}) {
  const { signOut, pending, errorMessage } = useSignOut();
  const { pathname } = useLocation();
  const isCurrent = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const initials =
    businessName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "SS";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <span
                  aria-hidden="true"
                  className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground"
                >
                  {initials}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-white">{businessName}</span>
                  <span className="truncate text-xs">{formatDayLabel(new Date())}</span>
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New entry"
              onClick={onNewEntry}
              className="mt-1 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:bg-sidebar-primary/90 active:text-sidebar-primary-foreground"
            >
              <Plus aria-hidden="true" />
              <span>New entry</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.items[0]?.to}>
              {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isCurrent(item.to)} tooltip={item.label}>
                        <NavLink to={item.to} end={item.to === "/"}>
                          {item.icon ? <item.icon aria-hidden="true" /> : null}
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        {errorMessage ? <ErrorNotice>{errorMessage}</ErrorNotice> : null}
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 rounded-lg p-1 group-data-[collapsible=icon]:p-0">
            <Avatar className="size-8 rounded-lg" aria-hidden="true">
              <AvatarFallback className="rounded-lg bg-blue-100 text-blue-900">O</AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm font-medium text-white group-data-[collapsible=icon]:hidden">
              Owner
            </span>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={signOut}
              disabled={pending}
              className="w-auto group-data-[collapsible=icon]:hidden"
            >
              <LogOut aria-hidden="true" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
