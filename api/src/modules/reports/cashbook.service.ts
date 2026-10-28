import type { Db } from "../../lib/prisma.ts";
import { cashFlows, netFlowBefore, openingFor } from "./cash-flows.ts";
import type { Cashbook, CashbookQuery } from "./reports.schema.ts";

/** The cash (or bank) book: opening, every line with a running balance, closing. */
export async function cashbook(db: Db, query: CashbookQuery): Promise<Cashbook> {
  return db.$transaction(
    async (tx) => {
      const opening =
        (await openingFor(tx, query.mode)) +
        (query.from ? await netFlowBefore(tx, query.mode, query.from) : 0);
      let running = opening;
      let inPaise = 0;
      let outPaise = 0;
      const lines = (await cashFlows(tx, query.mode, query)).map((flow) => {
        running += flow.inPaise - flow.outPaise;
        inPaise += flow.inPaise;
        outPaise += flow.outPaise;
        return { ...flow, balancePaise: running };
      });
      return {
        mode: query.mode,
        from: query.from ?? null,
        to: query.to ?? null,
        openingPaise: opening,
        lines,
        totals: { inPaise, outPaise },
        closingPaise: running,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
