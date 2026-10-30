import type { Ok } from "../api/types.ts";
import { json } from "./fake-api.ts";

type Drivers = Ok<"/drivers", "get">;
type Tractors = Ok<"/tractors", "get">;
type Khets = Ok<"/khets", "get">;
type Customers = Ok<"/customers", "get">;
type Trips = Ok<"/trips", "get">;
type Trip = Trips["items"][number];

export const TRACTORS: Tractors = {
  items: [
    {
      id: 3,
      regNumber: "RJ 21 RA 4412",
      label: "Mahindra 575",
      isActive: true,
      defaultDriver: { id: 2, name: "Suresh" },
    },
    {
      id: 4,
      regNumber: "RJ 21 RB 1190",
      label: "Swaraj 744",
      isActive: true,
      defaultDriver: { id: 5, name: "Bhanwar" },
    },
  ],
  total: 2,
  page: 1,
  limit: 200,
};

export const DRIVERS: Drivers = {
  items: [
    {
      id: 2,
      name: "Suresh",
      phone: null,
      joinedOn: "2026-04-01",
      leftOn: null,
      isActive: true,
      defaultTractor: { id: 3, regNumber: "RJ 21 RA 4412", label: "Mahindra 575" },
      currentMonthlyPaise: 1500000,
      salaryRates: [],
    },
    {
      id: 5,
      name: "Bhanwar",
      phone: null,
      joinedOn: "2026-04-01",
      leftOn: null,
      isActive: true,
      defaultTractor: { id: 4, regNumber: "RJ 21 RB 1190", label: "Swaraj 744" },
      currentMonthlyPaise: 1500000,
      salaryRates: [],
    },
  ],
  total: 2,
  page: 1,
  limit: 200,
};

export const KHETS: Khets = {
  items: [
    { id: 4, name: "Ladnun road", location: null, isActive: true },
    { id: 6, name: "Didwana", location: null, isActive: true },
  ],
  total: 2,
  page: 1,
  limit: 200,
};

export const CUSTOMERS: Customers = {
  items: [
    {
      id: 7,
      name: "Ramesh Bishnoi",
      phone: "9829041733",
      village: "Jaswantgarh",
      notes: null,
      isActive: true,
      createdAt: "2026-04-01T00:00:00.000Z",
    },
    {
      id: 8,
      name: "Sunil Jat",
      phone: null,
      village: "Ladnun",
      notes: null,
      isActive: true,
      createdAt: "2026-04-01T00:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 8,
};

export const TRIP: Trip = {
  id: 41,
  kind: "TRIP",
  tripDate: "2026-10-28",
  customer: { id: 7, name: "Ramesh Bishnoi" },
  driver: { id: 2, name: "Suresh" },
  tractor: { id: 3, regNumber: "RJ 21 RA 4412" },
  khet: { id: 4, name: "Ladnun road" },
  amountPaise: 350000,
  receivedPaise: 0,
  duePaise: 350000,
  status: "DUE",
  quantityNote: null,
  notes: null,
  deletedAt: null,
  createdAt: "2026-10-28T06:00:00.000Z",
};

export function tripPage(items: Trip[], total = items.length, page = 1): Trips {
  return {
    items,
    total,
    page,
    limit: 50,
    totals: {
      count: total,
      amountPaise: items.reduce((sum, trip) => sum + trip.amountPaise, 0),
      receivedPaise: items.reduce((sum, trip) => sum + trip.receivedPaise, 0),
      duePaise: items.reduce((sum, trip) => sum + trip.duePaise, 0),
    },
  };
}

export const NO_DUES: Ok<"/dues", "get"> = {
  asOf: "2026-10-28",
  customers: [],
  totals: { balancePaise: 0, byBucket: {} },
};

export const DUES: Ok<"/dues", "get"> = {
  asOf: "2026-10-28",
  customers: [
    {
      customer: { id: 7, name: "Ramesh Bishnoi", phone: "9829041733" },
      balancePaise: 1850000,
      duePaise: 1850000,
      creditPaise: 0,
      oldestDueDate: "2026-09-24",
      ageDays: 34,
      bucket: "31-90",
      hasUnappliedCredit: false,
    },
    {
      customer: { id: 8, name: "Sunil Jat", phone: null },
      balancePaise: 700000,
      duePaise: 900000,
      creditPaise: 200000,
      oldestDueDate: "2026-10-27",
      ageDays: 1,
      bucket: "0-7",
      hasUnappliedCredit: true,
    },
  ],
  totals: { balancePaise: 2550000, byBucket: { "0-7": 700000, "31-90": 1850000 } },
};

export const LEDGER: Ok<"/customers/{id}/ledger", "get"> = {
  customer: { id: 7, name: "Ramesh Bishnoi", phone: "9829041733" },
  from: "2026-04-01",
  to: "2026-10-28",
  openingBalancePaise: 0,
  entries: [
    {
      date: "2026-04-01",
      type: "OPENING_BALANCE",
      refId: 30,
      description: "Old register balance",
      debitPaise: 2350000,
      creditPaise: 0,
      balancePaise: 2350000,
    },
    {
      date: "2026-10-10",
      type: "PAYMENT",
      refId: 51,
      description: "Paid in cash",
      debitPaise: 0,
      creditPaise: 600000,
      balancePaise: 1750000,
    },
    {
      date: "2026-10-26",
      type: "TRIP",
      refId: 41,
      description: "Trip, Ladnun road",
      debitPaise: 350000,
      creditPaise: 0,
      balancePaise: 2100000,
    },
  ],
  totals: { debitPaise: 2700000, creditPaise: 600000 },
  closingBalancePaise: 2100000,
};

export const PAYMENT: Ok<"/payments/{id}", "get"> = {
  id: 51,
  customer: { id: 7, name: "Ramesh Bishnoi" },
  paidOn: "2026-10-10",
  kind: "PAYMENT",
  mode: "CASH",
  amountPaise: 600000,
  allocatedPaise: 600000,
  unallocatedPaise: 0,
  reference: null,
  notes: null,
  deliveryTripId: null,
  deletedAt: null,
  createdAt: "2026-10-10T06:00:00.000Z",
  allocations: [
    { tripId: 30, tripDate: "2026-04-01", tripKind: "OPENING_BALANCE", amountPaise: 600000 },
  ],
};

export const EXPENSE: Ok<"/expenses/{id}", "get"> = {
  id: 61,
  category: "DIESEL",
  spentOn: "2026-10-28",
  amountPaise: 450000,
  mode: "CASH",
  driver: { id: 2, name: "Suresh" },
  tractor: { id: 3, regNumber: "RJ 21 RA 4412" },
  labourer: null,
  dieselLitres: 47.5,
  hourMeter: null,
  tractorLoanId: null,
  emiMonth: null,
  lateFeePaise: null,
  periodFrom: null,
  periodTo: null,
  reference: null,
  notes: null,
  deletedAt: null,
  createdAt: "2026-10-28T06:00:00.000Z",
};

export const LABOURERS: Ok<"/labourers", "get"> = {
  items: [{ id: 11, name: "Mangilal", phone: null, notes: null, isActive: true }],
  total: 1,
  page: 1,
  limit: 200,
};

const balance = (
  balancePaise: number,
  duePaise: number,
  creditPaise: number,
): Ok<"/customers/{id}/balance", "get"> => ({
  balancePaise,
  duePaise,
  creditPaise,
});

/** What each fixture customer owes or holds: Ramesh owes, Sunil holds some credit against a due. */
export const BALANCE_ROUTES = {
  "GET /customers/7/balance": () => json(balance(1850000, 1850000, 0)),
  "GET /customers/8/balance": () => json(balance(700000, 900000, 200000)),
  "GET /customers/9/balance": () => json(balance(0, 0, 0)),
};

export function expensePage(
  items: Ok<"/expenses", "get">["items"],
  total = items.length,
): Ok<"/expenses", "get"> {
  const byCategory: Record<string, number> = {};
  for (const item of items)
    byCategory[item.category] = (byCategory[item.category] ?? 0) + item.amountPaise;
  return {
    items,
    total,
    page: 1,
    limit: 50,
    totals: { amountPaise: items.reduce((sum, item) => sum + item.amountPaise, 0), byCategory },
  };
}

export const DIESEL_REPORT: Ok<"/reports/diesel", "get"> = {
  from: "2026-10-01",
  to: "2026-10-28",
  tractors: [
    {
      tractor: { id: 3, regNumber: "RJ 21 RA 4412", label: "Mahindra 575" },
      litres: 95,
      amountPaise: 900000,
      trips: 19,
      litresPerTrip: 5,
    },
    {
      tractor: { id: 4, regNumber: "RJ 21 RB 1190", label: "Swaraj 744" },
      litres: 40,
      amountPaise: 380000,
      trips: 0,
      litresPerTrip: null,
    },
  ],
  drivers: [{ driver: { id: 2, name: "Suresh" }, litres: 95, amountPaise: 900000, trips: 19 }],
  totals: { litres: 135, amountPaise: 1280000, trips: 19 },
};

export const LOAN: Ok<"/loans/{id}", "get"> = {
  id: 5,
  tractor: { id: 3, regNumber: "RJ 21 RA 4412" },
  lender: "Mahindra Finance",
  emiPaise: 1820000,
  emiDay: 5,
  firstEmiMonth: "2026-08",
  lastEmiMonth: "2026-11",
  totalInstallments: 4,
  closedOn: null,
  closedReason: null,
  notes: null,
  paidPaise: 1820000,
  summary: { paidCount: 1, overdueCount: 1, nextDue: { month: "2026-09", dueDate: "2026-09-05" } },
  foreclosure: null,
  schedule: [
    {
      number: 1,
      month: "2026-08",
      dueDate: "2026-08-05",
      status: "PAID",
      payment: { expenseId: 70, paidOn: "2026-08-04", amountPaise: 1820000, lateFeePaise: 0 },
    },
    { number: 2, month: "2026-09", dueDate: "2026-09-05", status: "OVERDUE", payment: null },
    { number: 3, month: "2026-10", dueDate: "2026-10-05", status: "OVERDUE", payment: null },
    { number: 4, month: "2026-11", dueDate: "2026-11-05", status: "UPCOMING", payment: null },
  ],
};

export const LOAN_SUMMARY: Ok<"/loans", "get">[number] = {
  id: LOAN.id,
  tractor: LOAN.tractor,
  lender: LOAN.lender,
  emiPaise: LOAN.emiPaise,
  emiDay: LOAN.emiDay,
  firstEmiMonth: LOAN.firstEmiMonth,
  lastEmiMonth: LOAN.lastEmiMonth,
  totalInstallments: LOAN.totalInstallments,
  closedOn: null,
  closedReason: null,
  notes: null,
  paidPaise: LOAN.paidPaise,
  summary: LOAN.summary,
};

export const EMI_DUE: Ok<"/emi/due", "get"> = {
  asOf: "2026-10-28",
  items: [
    {
      loan: { id: 5, lender: "Mahindra Finance" },
      tractor: { id: 3, regNumber: "RJ 21 RA 4412" },
      month: "2026-09",
      dueDate: "2026-09-05",
      status: "OVERDUE",
      emiPaise: 1820000,
      daysLate: 53,
    },
    {
      loan: { id: 5, lender: "Mahindra Finance" },
      tractor: { id: 3, regNumber: "RJ 21 RA 4412" },
      month: "2026-11",
      dueDate: "2026-11-05",
      status: "UPCOMING",
      emiPaise: 1820000,
      daysLate: 0,
    },
  ],
};

export const SERVICES: Ok<"/tractors/{id}/services", "get"> = {
  tractor: { id: 3, regNumber: "RJ 21 RA 4412", label: "Mahindra 575" },
  lastService: { date: "2026-10-12", hourMeter: 1450, notes: "Oil change" },
  services: [
    {
      ...EXPENSE,
      id: 80,
      category: "TRACTOR_SERVICE",
      spentOn: "2026-10-12",
      amountPaise: 250000,
      driver: null,
      dieselLitres: null,
      hourMeter: 1450,
      notes: "Oil change",
    },
  ],
};

export const DRIVER: Ok<"/drivers/{id}", "get"> = {
  id: 2,
  name: "Suresh",
  phone: "9829012345",
  joinedOn: "2026-04-01",
  leftOn: null,
  isActive: true,
  defaultTractor: { id: 3, regNumber: "RJ 21 RA 4412", label: "Mahindra 575" },
  currentMonthlyPaise: 1500000,
  salaryRates: [{ id: 1, effectiveFrom: "2026-04-01", monthlyPaise: 1500000 }],
};

export const DRIVER_LEDGER: Ok<"/drivers/{id}/ledger", "get"> = {
  driver: { id: 2, name: "Suresh" },
  from: "2026-04-01",
  to: "2026-10-28",
  openingBalancePaise: 0,
  entries: [
    {
      date: "2026-09-30",
      type: "EARNED_SALARY",
      refId: 15,
      description: "Salary for Sep 2026",
      earnedPaise: 1500000,
      paidPaise: 0,
      balancePaise: 1500000,
    },
    {
      date: "2026-10-05",
      type: "PAID_ADVANCE",
      refId: 31,
      description: "Advance",
      earnedPaise: 0,
      paidPaise: 500000,
      balancePaise: 1000000,
    },
  ],
  months: [
    { month: "2026-09", earnedPaise: 1500000, paidPaise: 0, closingBalancePaise: 1500000 },
    { month: "2026-10", earnedPaise: 0, paidPaise: 500000, closingBalancePaise: 1000000 },
  ],
  closingBalancePaise: 1000000,
};

export const MONTH_SALARY: Ok<"/drivers/{id}/salary", "get"> = {
  month: "2026-09",
  monthlyPaise: 1500000,
  daysInMonth: 30,
  daysWorked: 30,
  suggestedPaise: 1500000,
  closed: null,
};

export const DRIVER_PAYMENTS: Ok<"/driver-payments", "get"> = {
  items: [
    {
      id: 31,
      driver: { id: 2, name: "Suresh" },
      paidOn: "2026-10-05",
      type: "ADVANCE",
      amountPaise: 500000,
      mode: "CASH",
      forMonth: null,
      notes: null,
      deletedAt: null,
      createdAt: "2026-10-05T06:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totals: { advancePaise: 500000, salaryPaise: 0, bonusPaise: 0 },
};
