import { rupeesToPaise } from "../../lib/money.ts";
import type { NewLoan } from "./useLoans.ts";

export interface LoanValues {
  lender: string;
  /** Rupees as typed. */
  emiAmount: string;
  emiDay: string;
  /** "2026-04", from a month picker. */
  firstEmiMonth: string;
  totalInstallments: string;
  notes: string;
}

export const EMPTY_LOAN: LoanValues = {
  lender: "",
  emiAmount: "",
  emiDay: "",
  firstEmiMonth: "",
  totalInstallments: "",
  notes: "",
};

/** The API's own limit on one loan. */
export const MAX_INSTALMENTS = 120;

export type LoanProblems = Partial<Record<keyof LoanValues, string>>;

export function checkLoan(values: LoanValues): LoanProblems {
  const problems: LoanProblems = {};
  if (values.lender.trim() === "") problems.lender = "Name the bank or finance company";
  const emi = rupeesToPaise(values.emiAmount);
  if (emi === null || emi === 0) problems.emiAmount = "Enter the EMI amount";
  const day = Number(values.emiDay);
  // Days 29 to 31 do not exist in every month, so the API takes 1 to 28.
  if (!/^\d{1,2}$/.test(values.emiDay) || day < 1 || day > 28)
    problems.emiDay = "Pick a day from 1 to 28";
  if (!/^\d{4}-\d{2}$/.test(values.firstEmiMonth))
    problems.firstEmiMonth = "Pick the month of the first EMI";
  const count = Number(values.totalInstallments);
  if (!/^\d{1,3}$/.test(values.totalInstallments) || count < 1) {
    problems.totalInstallments = "Enter how many EMIs in all";
  } else if (count > MAX_INSTALMENTS) {
    problems.totalInstallments = `A loan here runs at most ${String(MAX_INSTALMENTS)} EMIs (10 years)`;
  }
  return problems;
}

/** The loan as the API takes it. Call only once checkLoan finds nothing. */
export function loanBody(values: LoanValues): NewLoan {
  const notes = values.notes.trim();
  return {
    lender: values.lender.trim(),
    emiAmount: values.emiAmount,
    emiDay: Number(values.emiDay),
    firstEmiMonth: values.firstEmiMonth,
    totalInstallments: Number(values.totalInstallments),
    ...(notes ? { notes } : {}),
  };
}
