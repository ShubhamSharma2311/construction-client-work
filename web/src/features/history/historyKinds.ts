export interface HistoryKind {
  value: string;
  label: string;
  noun: string;
  /** Where one entry opens, for kinds that have a screen of their own. */
  link?: (id: string) => string;
  /** There is only ever one, so its number says nothing. */
  single?: boolean;
  /** Deleting removes it for good, so a deleted one has no screen to open. */
  removedOnDelete?: boolean;
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
  {
    value: "TractorLoan",
    label: "Tractor loans",
    noun: "loan",
    link: (id) => `/loans/${id}`,
    removedOnDelete: true,
  },
  { value: "Customer", label: "Customers", noun: "customer", link: (id) => `/dues/${id}` },
  { value: "Driver", label: "Drivers", noun: "driver", link: (id) => `/drivers/${id}` },
  { value: "DriverSalaryRate", label: "Salary rates", noun: "salary rate" },
  { value: "Tractor", label: "Tractors", noun: "tractor", link: (id) => `/tractors/${id}` },
  { value: "Khet", label: "Khets", noun: "khet" },
  { value: "Labourer", label: "Labourers", noun: "labourer" },
  { value: "Partner", label: "Partners", noun: "partner", link: (id) => `/partner/${id}` },
  { value: "Setting", label: "Business settings", noun: "settings", single: true },
] as const satisfies readonly HistoryKind[];
