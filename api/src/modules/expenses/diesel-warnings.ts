import { formatPaise } from "../../lib/money.ts";
import type { Tx } from "../../lib/prisma.ts";

/** Pump prices outside this band per litre are almost always a typo in litres or amount. */
export const DIESEL_RATE_PAISE = { min: 7_000, max: 13_000 } as const;

export interface DieselFill {
  tractorId: number;
  driverId: number;
  dieselMl: number;
  amountPaise: number;
}

/** Things worth a second look on a diesel fill; none of them stop it being saved. */
export async function dieselWarnings(tx: Tx, fill: DieselFill): Promise<string[]> {
  const warnings: string[] = [];
  const ratePaise = Math.round((fill.amountPaise * 1000) / fill.dieselMl);
  if (ratePaise < DIESEL_RATE_PAISE.min || ratePaise > DIESEL_RATE_PAISE.max) {
    warnings.push(
      `${formatPaise(ratePaise)} per litre looks wrong; check the litres and the amount`,
    );
  }
  const [driver, tractor] = await Promise.all([
    tx.driver.findUnique({
      where: { id: fill.driverId },
      include: { defaultTractor: { select: { id: true, regNumber: true } } },
    }),
    tx.tractor.findUnique({ where: { id: fill.tractorId } }),
  ]);
  // checkLinks has already confirmed both exist; reaching here without them is a bug.
  if (!driver || !tractor) {
    throw new Error(
      `Diesel fill names driver ${String(fill.driverId)} / tractor ${String(fill.tractorId)} that do not exist`,
    );
  }
  const usual = driver.defaultTractor;
  if (usual && usual.id !== tractor.id) {
    warnings.push(
      `${driver.name} usually drives ${usual.regNumber}; this fill is for ${tractor.regNumber}`,
    );
  }
  return warnings;
}
