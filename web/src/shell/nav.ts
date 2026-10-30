export interface Destination {
  to: string;
  label: string;
}

export interface NavGroup {
  /** Shown above the group in the side menu; null keeps only the gap between groups. */
  label: string | null;
  items: Destination[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { to: "/", label: "Today" },
      { to: "/trips", label: "Trips" },
      { to: "/dues", label: "Customers" },
      { to: "/expenses", label: "Expenses" },
    ],
  },
  {
    label: null,
    items: [
      { to: "/tractors", label: "Tractors" },
      { to: "/drivers", label: "Drivers" },
      { to: "/partner", label: "Partner" },
      { to: "/reports", label: "Reports" },
    ],
  },
  {
    label: null,
    items: [
      { to: "/setup", label: "Khets & labourers" },
      { to: "/settings", label: "Settings" },
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
