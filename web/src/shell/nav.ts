import {
  BarChart3,
  Handshake,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  Receipt,
  Settings,
  Tractor,
  Truck,
  UserRound,
  Users,
} from "lucide-react";

export interface Destination {
  to: string;
  label: string;
  /** Beside the name in the side menu, and the only thing shown when it is folded. */
  icon?: LucideIcon;
}

export interface NavGroup {
  /** Shown above the group in the side menu, as in the approved preview; null shows none. */
  label: string | null;
  items: Destination[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Daily work",
    items: [
      { to: "/", label: "Today", icon: LayoutDashboard },
      { to: "/trips", label: "Trips", icon: Truck },
      { to: "/dues", label: "Customers", icon: Users },
      { to: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/tractors", label: "Tractors", icon: Tractor },
      { to: "/drivers", label: "Drivers", icon: UserRound },
      { to: "/partner", label: "Partner", icon: Handshake },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Setup",
    items: [
      { to: "/setup", label: "Khets & labourers", icon: MapPin },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** The phone's bottom tabs; New entry sits in the middle of them. */
export const PHONE_TABS: { before: Destination[]; after: Destination[] } = {
  before: [
    { to: "/", label: "Today" },
    { to: "/trips", label: "Trips" },
  ],
  after: [
    { to: "/dues", label: "Customers" },
    { to: "/more", label: "More" },
  ],
};

const tabTargets = new Set([...PHONE_TABS.before, ...PHONE_TABS.after].map((tab) => tab.to));

/** Everything the phone tabs leave out, listed on the More screen. */
export const MORE_ITEMS: Destination[] = NAV_GROUPS.flatMap((group) => group.items).filter(
  (item) => !tabTargets.has(item.to),
);

export interface EntryKind extends Destination {
  detail: string;
}

export const NEW_ENTRIES: EntryKind[] = [
  { to: "/new/trip", label: "New trip", detail: "Sand delivered to a customer" },
  {
    to: "/new/payment",
    label: "Money from customer",
    detail: "Money in from a customer, or a due cleared",
  },
  {
    to: "/new/expense",
    label: "Add expense",
    detail: "Labour, royalty, police, other or emergency",
  },
  { to: "/new/diesel", label: "Diesel", detail: "Fuel for a tractor" },
  { to: "/new/driver-payment", label: "Pay driver", detail: "Salary, advance or bonus" },
  { to: "/new/emi", label: "Pay EMI", detail: "A loan instalment" },
  { to: "/new/service", label: "Tractor repair", detail: "Repairs and servicing" },
  {
    to: "/new/partner",
    label: "Money with partner",
    detail: "Money paid to or received from the partner",
  },
];

/** The menu section a screen belongs to, for the top bar; none on Today itself. */
export function sectionOf(pathname: string): Destination | undefined {
  if (pathname === "/") return undefined;
  const all = [
    ...NAV_GROUPS.flatMap((group) => group.items),
    ...NEW_ENTRIES,
    { to: "/more", label: "More" },
  ];
  return all
    .filter(
      (item) => item.to !== "/" && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
}
