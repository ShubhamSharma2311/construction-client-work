import type { Ok } from "../api/types.ts";

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
