import type { PayMode } from "../../lib/payModes.ts";
import type { PickedCustomer } from "../customers/CustomerPicker.tsx";
import type { IsoDate } from "../../lib/dates.ts";
import { rupeesToPaise } from "../../lib/money.ts";
import type { TripItem } from "./tripFilters.ts";
import type { NewTrip, TripChanges } from "./useTrips.ts";

export interface TripValues {
  tripDate: IsoDate;
  customer: PickedCustomer | null;
  driverId: string;
  tractorId: string;
  khetId: string;
  /** Rupees as typed. */
  amount: string;
  quantityNote: string;
  notes: string;
}

export type PaymentType = "CASH" | "ONLINE" | "DUE" | "PARTIAL";

export interface PaymentValues {
  type: PaymentType;
  paidAmount: string;
  mode: PayMode;
  reference: string;
}

export const NO_PAYMENT: PaymentValues = {
  type: "CASH",
  paidAmount: "",
  mode: "CASH",
  reference: "",
};

export function emptyTrip(tripDate: IsoDate): TripValues {
  return {
    tripDate,
    customer: null,
    driverId: "",
    tractorId: "",
    khetId: "",
    amount: "",
    quantityNote: "",
    notes: "",
  };
}

export function tripValuesOf(trip: TripItem): TripValues {
  return {
    tripDate: trip.tripDate,
    customer: { id: trip.customer.id, name: trip.customer.name },
    driverId: trip.driver ? String(trip.driver.id) : "",
    tractorId: trip.tractor ? String(trip.tractor.id) : "",
    khetId: trip.khet ? String(trip.khet.id) : "",
    amount: (trip.amountPaise / 100).toFixed(2).replace(/\.00$/, ""),
    quantityNote: trip.quantityNote ?? "",
    notes: trip.notes ?? "",
  };
}

/** Problems the person can fix before anything is sent, keyed by field. */
export function checkTrip(
  values: TripValues,
  payment: PaymentValues | null,
): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!values.tripDate) problems["tripDate"] = "Pick the date of the trip";
  if (!values.customer) problems["customer"] = "Pick the customer, or add a new one";
  if (!values.driverId) problems["driverId"] = "Pick the driver";
  if (!values.tractorId) problems["tractorId"] = "Pick the tractor";
  if (!values.khetId) problems["khetId"] = "Pick the khet the sand came from";
  const amount = rupeesToPaise(values.amount);
  if (amount === null || amount === 0) problems["amount"] = "Enter the trip amount";
  if (payment?.type === "PARTIAL") {
    const paid = rupeesToPaise(payment.paidAmount);
    if (paid === null || paid === 0) problems["paidAmount"] = "Enter how much was paid now";
    else if (amount !== null && paid >= amount) {
      problems["paidAmount"] =
        "Paid now must be less than the trip amount; pick Cash or Online if it was all paid";
    }
  }
  return problems;
}

function optionalText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

function withReference<T extends object>(
  payment: T,
  reference: string,
): T & { reference?: string } {
  const text = optionalText(reference);
  return text === undefined ? payment : { ...payment, reference: text };
}

function paymentBody(payment: PaymentValues): NewTrip["payment"] {
  switch (payment.type) {
    case "CASH":
      return { type: "CASH" };
    case "DUE":
      return { type: "DUE" };
    case "ONLINE":
      return withReference({ type: "ONLINE" as const }, payment.reference);
    case "PARTIAL":
      return withReference(
        { type: "PARTIAL" as const, paidAmount: payment.paidAmount, mode: payment.mode },
        payment.mode === "ONLINE" ? payment.reference : "",
      );
  }
}

/** The new trip as the API takes it. Call only once checkTrip finds nothing. */
export function newTripBody(values: TripValues, payment: PaymentValues): NewTrip {
  if (!values.customer) throw new Error("newTripBody needs a customer; run checkTrip first");
  const quantityNote = optionalText(values.quantityNote);
  const notes = optionalText(values.notes);
  return {
    tripDate: values.tripDate,
    customerId: values.customer.id,
    driverId: Number(values.driverId),
    tractorId: Number(values.tractorId),
    khetId: Number(values.khetId),
    amount: values.amount,
    ...(quantityNote === undefined ? {} : { quantityNote }),
    ...(notes === undefined ? {} : { notes }),
    payment: paymentBody(payment),
  };
}

/** Only what was changed; the API refuses an edit that names nothing. */
export function tripChanges(before: TripValues, after: TripValues): TripChanges {
  const changes: TripChanges = {};
  if (after.tripDate !== before.tripDate) changes.tripDate = after.tripDate;
  if (after.customer && after.customer.id !== before.customer?.id)
    changes.customerId = after.customer.id;
  if (after.driverId !== before.driverId) changes.driverId = Number(after.driverId);
  if (after.tractorId !== before.tractorId) changes.tractorId = Number(after.tractorId);
  if (after.khetId !== before.khetId) changes.khetId = Number(after.khetId);
  if (rupeesToPaise(after.amount) !== rupeesToPaise(before.amount)) changes.amount = after.amount;
  if (after.quantityNote.trim() !== before.quantityNote.trim())
    changes.quantityNote = after.quantityNote.trim();
  if (after.notes.trim() !== before.notes.trim()) changes.notes = after.notes.trim();
  return changes;
}

/** Server field names mapped to the form's own, so its words land on the right field. */
export const SERVER_FIELDS: Record<string, string> = {
  customerId: "customer",
  "payment.paidAmount": "paidAmount",
  "payment.mode": "mode",
  "payment.reference": "reference",
};
