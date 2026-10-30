import { describe, expect, it } from "vitest";
import { canUseCredit, standingOf } from "./standing.ts";

describe("a customer's standing", () => {
  it.each([
    [
      { balancePaise: 1850000, duePaise: 1850000, creditPaise: 0 },
      { kind: "owes", paise: 1850000 },
    ],
    [
      { balancePaise: -200000, duePaise: 100000, creditPaise: 300000 },
      { kind: "credit", paise: 200000 },
    ],
    [{ balancePaise: 0, duePaise: 0, creditPaise: 0 }, { kind: "settled" }],
  ])("reads %j", (balance, standing) => {
    expect(standingOf(balance)).toEqual(standing);
  });

  it("offers to use credit while some is held and something is due, even when credit is larger", () => {
    expect(canUseCredit({ balancePaise: -200000, duePaise: 100000, creditPaise: 300000 })).toBe(
      true,
    );
    expect(canUseCredit({ balancePaise: -300000, duePaise: 0, creditPaise: 300000 })).toBe(false);
  });
});
