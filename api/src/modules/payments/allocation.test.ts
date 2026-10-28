import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkManualPlan, planFifo, sumLines } from "./allocation.ts";

describe("planFifo", () => {
  const dues = [
    { tripId: 1, duePaise: 1000 },
    { tripId: 2, duePaise: 500 },
    { tripId: 3, duePaise: 700 },
  ];

  it("clears the oldest dues first and part-pays the next", () => {
    expect(planFifo(dues, 1200)).toEqual([
      { tripId: 1, amountPaise: 1000 },
      { tripId: 2, amountPaise: 200 },
    ]);
  });

  it("leaves the rest unallocated when it pays more than is due", () => {
    expect(sumLines(planFifo(dues, 5000))).toBe(2200);
  });

  it("skips trips with nothing due", () => {
    expect(planFifo([{ tripId: 9, duePaise: 0 }, ...dues], 100)).toEqual([
      { tripId: 1, amountPaise: 100 },
    ]);
  });

  it("never allocates more than the payment or than any trip owes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100_000 }), { maxLength: 20 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (amounts, payment) => {
          const list = amounts.map((duePaise, index) => ({ tripId: index + 1, duePaise }));
          const lines = planFifo(list, payment);
          const totalDue = amounts.reduce((total, amount) => total + amount, 0);

          expect(sumLines(lines)).toBe(Math.min(payment, totalDue));
          for (const line of lines) {
            expect(line.amountPaise).toBeGreaterThan(0);
            expect(line.amountPaise).toBeLessThanOrEqual(list[line.tripId - 1]?.duePaise ?? 0);
          }
        },
      ),
    );
  });
});

describe("checkManualPlan", () => {
  const dues = new Map([
    [1, 1000],
    [2, 500],
  ]);

  it("accepts a plan within each trip's due and the payment", () => {
    expect(() => {
      checkManualPlan(dues, [{ tripId: 2, amountPaise: 500 }], 800);
    }).not.toThrow();
  });

  it.each([
    [
      "a trip twice",
      [
        { tripId: 1, amountPaise: 1 },
        { tripId: 1, amountPaise: 1 },
      ],
      10,
      "twice",
    ],
    ["a trip that is not open", [{ tripId: 7, amountPaise: 1 }], 10, "not an open trip"],
    ["more than a trip owes", [{ tripId: 2, amountPaise: 501 }], 1000, "only has"],
    [
      "more than the payment",
      [
        { tripId: 1, amountPaise: 600 },
        { tripId: 2, amountPaise: 500 },
      ],
      1000,
      "more than the payment",
    ],
  ])("refuses %s", (_label, lines, amount, message) => {
    expect(() => {
      checkManualPlan(dues, lines, amount);
    }).toThrow(message);
  });
});
