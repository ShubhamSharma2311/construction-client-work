import type { PayMode } from "../../lib/payModes.ts";
import type { IsoDate } from "../../lib/dates.ts";
import { paiseToRupeeInput, rupeesToPaise } from "../../lib/money.ts";
import type { PickedCustomer } from "../customers/CustomerPicker.tsx";
import type { TripItem } from "../trips/tripFilters.ts";
import type { NewPayment } from "./usePayments.ts";

export type PaymentKind = "PAYMENT" | "WRITE_OFF";

export interface PaymentFormValues {
  customer: PickedCustomer | null;
  kind: PaymentKind;
  paidOn: IsoDate;
  /** Rupees as typed. */
  amount: string;
  mode: PayMode;
  reference: string;
  notes: string;
  /** AUTO: the server pays the oldest dues first. MANUAL: the trips in `chosen`. */
  allocation: "AUTO" | "MANUAL";
  /** Trip ids in the order they were ticked; the money goes to them in that order. */
  chosen: number[];
}

export interface ChosenShare {
  trip: TripItem;
  paise: number;
}

/**
 * How the money is shared over the ticked trips: each takes what it still owes, in the
 * order ticked, until the money runs out. Whatever is left becomes the customer's credit.
 */
export function shareOver(
  amountPaise: number,
  chosen: number[],
  unpaid: TripItem[],
): { shares: ChosenShare[]; leftPaise: number } {
  let left = amountPaise;
  const shares: ChosenShare[] = [];
  for (const id of chosen) {
    const trip = unpaid.find((candidate) => candidate.id === id);
    if (!trip || left === 0) continue;
    const paise = Math.min(trip.duePaise, left);
    shares.push({ trip, paise });
    left -= paise;
  }
  return { shares, leftPaise: left };
}

export function checkPayment(
  values: PaymentFormValues,
  unpaid: TripItem[],
): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!values.customer) problems["customer"] = "Pick the customer";
  if (!values.paidOn) problems["paidOn"] = "Pick the date";
  const amount = rupeesToPaise(values.amount);
  if (amount === null || amount === 0) {
    problems["amount"] =
      values.kind === "PAYMENT" ? "Enter the amount received" : "Enter the discount amount";
  }
  if (values.allocation === "MANUAL" && values.chosen.length === 0) {
    problems["allocation"] = "Tick the trips this pays, or let it pay the oldest dues first";
  } else if (values.allocation === "MANUAL" && values.kind === "WRITE_OFF" && amount !== null) {
    // Forgiven money cannot become credit: the ticked trips must owe all of it.
    if (shareOver(amount, values.chosen, unpaid).leftPaise > 0) {
      problems["allocation"] = "Tick trips that owe at least the discount";
    }
  }
  if (values.kind === "WRITE_OFF" && values.notes.trim() === "") {
    problems["notes"] = "Say why the discount was given, e.g. settled for less";
  }
  return problems;
}

function optional(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** The payment as the API takes it. Call only once checkPayment finds nothing. */
export function paymentBody(values: PaymentFormValues, unpaid: TripItem[]): NewPayment {
  const amountPaise = rupeesToPaise(values.amount) ?? 0;
  const allocation =
    values.allocation === "AUTO"
      ? { strategy: "AUTO" as const }
      : {
          strategy: "MANUAL" as const,
          items: shareOver(amountPaise, values.chosen, unpaid).shares.map((share) => ({
            tripId: share.trip.id,
            amount: paiseToRupeeInput(share.paise),
          })),
        };
  const notes = optional(values.notes);
  const common = {
    paidOn: values.paidOn,
    amount: values.amount,
    allocation,
    ...(notes === undefined ? {} : { notes }),
  };
  if (values.kind === "WRITE_OFF") return { kind: "WRITE_OFF", ...common };
  const reference = values.mode === "ONLINE" ? optional(values.reference) : undefined;
  return {
    kind: "PAYMENT",
    mode: values.mode,
    ...common,
    ...(reference === undefined ? {} : { reference }),
  };
}
