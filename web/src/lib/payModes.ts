/** How money moved: cash in hand, or online through the bank. Every entry is one or the other. */
export type PayMode = "CASH" | "ONLINE";

export const PAY_MODES = ["CASH", "ONLINE"] as const satisfies readonly PayMode[];

export const PAY_MODE_LABELS: Record<PayMode, string> = { CASH: "Cash", ONLINE: "Online" };

/** The choice shown on every form that records money. */
export const PAY_MODE_OPTIONS = PAY_MODES.map((value) => ({
  value,
  label: PAY_MODE_LABELS[value],
}));
