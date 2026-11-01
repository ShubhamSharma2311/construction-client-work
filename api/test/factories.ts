import { expect } from "vitest";
import type { CustomerCreated, CustomerDto } from "../src/modules/customers/customers.schema.ts";
import type { DriverDto } from "../src/modules/drivers/drivers.schema.ts";
import type { KhetDto } from "../src/modules/khets/khets.schema.ts";
import type { LabourerDto } from "../src/modules/labourers/labourers.schema.ts";
import type { PartnerDto } from "../src/modules/partners/partners.schema.ts";
import type { PaymentSaved } from "../src/modules/payments/payments.schema.ts";
import type { SettingsDto } from "../src/modules/settings/settings.schema.ts";
import type { TractorDto } from "../src/modules/tractors/tractors.schema.ts";
import type { TripSaved } from "../src/modules/trips/trips.schema.ts";
import type { TestContext } from "./app.ts";

/** Builds records through the real API, so tests exercise the same rules the owner hits. */
async function created<T>(t: TestContext, url: string, body: unknown): Promise<T> {
  const response = await t.post(url, body);
  expect(response.statusCode, `${url}: ${response.body}`).toBe(201);
  return response.json<T>();
}

export const BUSINESS_START = "2026-04-01";

export async function makeSettings(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<SettingsDto> {
  const response = await t.put("/settings", {
    businessName: "Sawariya Seth Construction Materials",
    businessStartDate: BUSINESS_START,
    openingCash: 0,
    openingOnline: 0,
    ...overrides,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<SettingsDto>();
}

let sequence = 0;
const next = () => (sequence += 1);

export async function makeCustomer(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<CustomerDto> {
  const result = await created<CustomerCreated>(t, "/customers", {
    name: `Customer ${String(next())}`,
    ...overrides,
  });
  return result.customer;
}

export async function makeTractor(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<TractorDto> {
  const n = next();
  return created<TractorDto>(t, "/tractors", {
    regNumber: `RJ19AB${String(1000 + n)}`,
    label: `Tractor ${String(n)}`,
    ...overrides,
  });
}

export async function makeDriver(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<DriverDto> {
  return created<DriverDto>(t, "/drivers", {
    name: `Driver ${String(next())}`,
    joinedOn: BUSINESS_START,
    monthlySalary: 15000,
    ...overrides,
  });
}

export async function makeKhet(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<KhetDto> {
  return created<KhetDto>(t, "/khets", { name: `Khet ${String(next())}`, ...overrides });
}

export async function makeLabourer(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<LabourerDto> {
  return created<LabourerDto>(t, "/labourers", {
    name: `Labourer ${String(next())}`,
    ...overrides,
  });
}

export async function makePartner(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<PartnerDto> {
  return created<PartnerDto>(t, "/partners", { name: "Manish", sharePercent: 50, ...overrides });
}

export interface TripMasters {
  customer: CustomerDto;
  driver: DriverDto;
  tractor: TractorDto;
  khet: KhetDto;
}

/** Settings plus one of each master a trip needs; the driver usually drives the tractor. */
export async function makeTripMasters(t: TestContext): Promise<TripMasters> {
  await makeSettings(t);
  const tractor = await makeTractor(t);
  const driver = await makeDriver(t, { defaultTractorId: tractor.id });
  const customer = await makeCustomer(t);
  const khet = await makeKhet(t);
  return { customer, driver, tractor, khet };
}

export async function makeTrip(
  t: TestContext,
  masters: TripMasters,
  overrides: Record<string, unknown> = {},
): Promise<TripSaved> {
  return created<TripSaved>(t, "/trips", {
    tripDate: "2026-10-20",
    customerId: masters.customer.id,
    driverId: masters.driver.id,
    tractorId: masters.tractor.id,
    khetId: masters.khet.id,
    amount: 1000,
    payment: { type: "DUE" },
    ...overrides,
  });
}

export async function makePayment(
  t: TestContext,
  customerId: number,
  overrides: Record<string, unknown> = {},
): Promise<PaymentSaved> {
  return created<PaymentSaved>(t, `/customers/${String(customerId)}/payments`, {
    kind: "PAYMENT",
    paidOn: "2026-10-25",
    amount: 1000,
    mode: "CASH",
    ...overrides,
  });
}
