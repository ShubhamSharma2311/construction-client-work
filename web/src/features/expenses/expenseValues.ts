import type { ExpenseCategory, ExpenseItem } from "../../api/types.ts";
import type { IsoDate } from "../../lib/dates.ts";
import { formatRupees, paiseToRupeeInput, rupeesToPaise } from "../../lib/money.ts";
import type { PayMode } from "../../lib/payModes.ts";
import type { ExpenseChanges, NewExpense } from "./useExpenses.ts";

/** The kinds entered by hand; EMIs come from a tractor's loan instead. */
export type EnteredCategory = Exclude<ExpenseCategory, "TRACTOR_EMI">;

/** The everyday kinds offered on "Expense"; diesel and service have their own entries. */
export const GENERAL_CATEGORIES = [
  "LABOUR",
  "ROYALTY",
  "POLICE",
  "OTHER",
  "EMERGENCY",
] as const satisfies readonly EnteredCategory[];

export interface ExpenseValues {
  category: EnteredCategory;
  spentOn: IsoDate;
  /** Rupees as typed. */
  amount: string;
  mode: PayMode;
  reference: string;
  notes: string;
  labourerId: string;
  tractorId: string;
  driverId: string;
  /** Litres as typed, e.g. "45.5". */
  litres: string;
  hourMeter: string;
  /** Empty when the royalty covers no particular period. */
  periodFrom: IsoDate;
  periodTo: IsoDate;
}

export function emptyExpense(category: EnteredCategory, spentOn: IsoDate): ExpenseValues {
  return {
    category,
    spentOn,
    amount: "",
    mode: "CASH",
    reference: "",
    notes: "",
    labourerId: "",
    tractorId: "",
    driverId: "",
    litres: "",
    hourMeter: "",
    periodFrom: "",
    periodTo: "",
  };
}

export function expenseValuesOf(
  expense: ExpenseItem & { category: EnteredCategory },
): ExpenseValues {
  return {
    category: expense.category,
    spentOn: expense.spentOn,
    amount: paiseToRupeeInput(expense.amountPaise),
    mode: expense.mode,
    reference: expense.reference ?? "",
    notes: expense.notes ?? "",
    labourerId: expense.labourer ? String(expense.labourer.id) : "",
    tractorId: expense.tractor ? String(expense.tractor.id) : "",
    driverId: expense.driver ? String(expense.driver.id) : "",
    litres: expense.dieselLitres === null ? "" : String(expense.dieselLitres),
    hourMeter: expense.hourMeter === null ? "" : String(expense.hourMeter),
    periodFrom: expense.periodFrom ?? "",
    periodTo: expense.periodTo ?? "",
  };
}

const LITRES_INPUT = /^\d{0,3}(\.\d{0,2})?$/;
const MAX_LITRES_CENTI = 50_000;

/** Whether text typed into the litres field can still become an amount of diesel. */
export function isLitresInput(text: string): boolean {
  return LITRES_INPUT.test(text);
}

/**
 * Hundredths of a litre from what was typed ("45", "45.5", ".5", "45."), or null when no
 * digits were typed; diesel maths stays in whole numbers, as money does.
 */
export function centilitres(text: string): number | null {
  const match = /^(\d{0,3})(?:\.(\d{0,2}))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return null;
  return Number(match[1] || "0") * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Litres as the API reads them: always digits on both sides of a point, "45." becomes "45". */
function litresText(text: string): string {
  return String((centilitres(text) ?? 0) / 100);
}

/** The reference field is for online money and a royalty's receipt number; nothing else shows it. */
export function showsReference(values: Pick<ExpenseValues, "category" | "mode">): boolean {
  return values.mode === "ONLINE" || values.category === "ROYALTY";
}

/** "₹95.20 a litre", or null until both amount and litres are filled in. */
export function ratePerLitre(amount: string, litres: string): string | null {
  const paise = rupeesToPaise(amount);
  const centi = centilitres(litres);
  if (paise === null || centi === null || paise === 0 || centi === 0) return null;
  return `${formatRupees(Math.round((paise * 100) / centi))} a litre`;
}

const NOTE_REQUIRED: Partial<Record<EnteredCategory, string>> = {
  POLICE: "Say who it was paid to and why",
  OTHER: "Say what it was for",
  EMERGENCY: "Say what happened",
  TRACTOR_SERVICE: "Say what work was done",
};

export type ExpenseProblems = Partial<Record<keyof ExpenseValues, string>>;

export function checkExpense(values: ExpenseValues): ExpenseProblems {
  const problems: ExpenseProblems = {};
  if (!values.spentOn) problems["spentOn"] = "Pick the date";
  const amount = rupeesToPaise(values.amount);
  if (amount === null || amount === 0) problems["amount"] = "Enter the amount paid";
  const noteProblem = NOTE_REQUIRED[values.category];
  if (noteProblem && values.notes.trim() === "") problems["notes"] = noteProblem;
  switch (values.category) {
    case "LABOUR":
      if (!values.labourerId) problems["labourerId"] = "Pick who was paid";
      break;
    case "DIESEL": {
      if (!values.tractorId) problems["tractorId"] = "Pick the tractor";
      if (!values.driverId) problems["driverId"] = "Pick the driver";
      const centi = centilitres(values.litres);
      if (centi === null || centi === 0) problems["litres"] = "Enter the litres filled";
      else if (centi > MAX_LITRES_CENTI) problems["litres"] = "A fill is at most 500 litres";
      break;
    }
    case "TRACTOR_SERVICE":
      if (!values.tractorId) problems["tractorId"] = "Pick the tractor";
      break;
    case "ROYALTY":
      if ((values.periodFrom === "") !== (values.periodTo === "")) {
        problems["periodTo"] = "Give both dates of the period, or neither";
      } else if (values.periodFrom && values.periodFrom > values.periodTo) {
        problems["periodTo"] = "The period must end after it starts";
      } else if (values.periodTo && values.periodTo > values.spentOn) {
        problems["periodTo"] = "The period cannot end after the payment date";
      }
      break;
    case "POLICE":
    case "OTHER":
    case "EMERGENCY":
      break;
  }
  return problems;
}

function optional(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

function idOrNothing(id: string): number | undefined {
  return id === "" ? undefined : Number(id);
}

/** The expense as the API takes it, with only its own kind's fields. Call once checkExpense finds nothing. */
export function expenseBody(values: ExpenseValues): NewExpense {
  const reference = showsReference(values) ? optional(values.reference) : undefined;
  const notes = optional(values.notes) ?? "";
  const common = {
    spentOn: values.spentOn,
    amount: values.amount,
    mode: values.mode,
    ...(reference === undefined ? {} : { reference }),
  };
  const withNotes = notes === "" ? common : { ...common, notes };
  switch (values.category) {
    case "LABOUR":
      return { category: "LABOUR", ...withNotes, labourerId: Number(values.labourerId) };
    case "ROYALTY":
      return {
        category: "ROYALTY",
        ...withNotes,
        ...(values.periodFrom && values.periodTo
          ? { periodFrom: values.periodFrom, periodTo: values.periodTo }
          : {}),
      };
    case "POLICE":
      return { category: "POLICE", ...common, notes };
    case "OTHER":
      return { category: "OTHER", ...common, notes };
    case "EMERGENCY": {
      const tractorId = idOrNothing(values.tractorId);
      const driverId = idOrNothing(values.driverId);
      return {
        category: "EMERGENCY",
        ...common,
        notes,
        ...(tractorId === undefined ? {} : { tractorId }),
        ...(driverId === undefined ? {} : { driverId }),
      };
    }
    case "TRACTOR_SERVICE":
      return {
        category: "TRACTOR_SERVICE",
        ...common,
        notes,
        tractorId: Number(values.tractorId),
        ...(values.hourMeter === "" ? {} : { hourMeter: Number(values.hourMeter) }),
      };
    case "DIESEL":
      return {
        category: "DIESEL",
        ...withNotes,
        tractorId: Number(values.tractorId),
        driverId: Number(values.driverId),
        litres: litresText(values.litres),
      };
  }
}

/** An id as the edit takes it: a number, or null when a field that may be empty was cleared. */
function idChange(id: string): number | null {
  return id === "" ? null : Number(id);
}

/**
 * Only what changed; the API refuses an edit that names nothing. A cleared optional field
 * (an emergency's tractor, a service's hour meter, a royalty's period, a hidden reference)
 * is sent as null so it is removed, not left as it was.
 */
export function expenseChanges(before: ExpenseValues, after: ExpenseValues): ExpenseChanges {
  const changes: ExpenseChanges = {};
  if (after.spentOn !== before.spentOn) changes.spentOn = after.spentOn;
  if (rupeesToPaise(after.amount) !== rupeesToPaise(before.amount)) changes.amount = after.amount;
  if (after.mode !== before.mode) changes.mode = after.mode;
  const reference = showsReference(after) ? after.reference.trim() : "";
  if (reference !== before.reference) changes.reference = reference === "" ? null : reference;
  if (after.notes.trim() !== before.notes) changes.notes = after.notes.trim();
  if (after.labourerId !== before.labourerId && after.labourerId)
    changes.labourerId = Number(after.labourerId);
  if (after.tractorId !== before.tractorId) changes.tractorId = idChange(after.tractorId);
  if (after.driverId !== before.driverId) changes.driverId = idChange(after.driverId);
  if (centilitres(after.litres) !== centilitres(before.litres) && after.litres) {
    changes.litres = litresText(after.litres);
  }
  if (after.hourMeter !== before.hourMeter)
    changes.hourMeter = after.hourMeter === "" ? null : Number(after.hourMeter);
  if (after.periodFrom !== before.periodFrom || after.periodTo !== before.periodTo) {
    changes.periodFrom = after.periodFrom === "" ? null : after.periodFrom;
    changes.periodTo = after.periodTo === "" ? null : after.periodTo;
  }
  return changes;
}
