import type { ClosedRange } from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import type { Db } from "../../lib/prisma.ts";
import { profitAndLossIn } from "../reports/pnl.service.ts";
import type { PartnerShare } from "../reports/reports.schema.ts";
import { partnerLedgerIn } from "./partner-account.service.ts";

/**
 * The partner's share of profit for a period against what was paid to them in it, read from
 * one snapshot. A loss gives a negative share: the partner bears their part of it.
 */
export async function partnerShare(
  db: Db,
  partnerId: number,
  range: ClosedRange,
): Promise<PartnerShare> {
  return db.$transaction(
    async (tx) => {
      const partner = await tx.partner.findUnique({ where: { id: partnerId } });
      if (!partner) throw notFound("Partner", partnerId);
      if (partner.shareBasisPoints === null) {
        throw new AppError(
          "CONFLICT",
          `${partner.name} has no profit share set; add the share percent to the partner first`,
        );
      }
      const pnl = await profitAndLossIn(tx, range);
      const ledger = await partnerLedgerIn(tx, partnerId, range);
      const shareDuePaise = Math.round((pnl.profitPaise * partner.shareBasisPoints) / 10_000);
      const netPaidPaise = ledger.totals.netPaidPaise;
      return {
        partner: {
          id: partner.id,
          name: partner.name,
          sharePercent: partner.shareBasisPoints / 100,
        },
        from: range.from,
        to: range.to,
        profitPaise: pnl.profitPaise,
        shareDuePaise,
        netPaidPaise,
        balancePaise: shareDuePaise - netPaidPaise,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
