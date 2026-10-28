import { AppError, notFound } from "../../lib/errors.ts";
import type { Tx } from "../../lib/prisma.ts";

export interface TripMasterIds {
  customerId: number;
  driverId: number;
  tractorId: number;
  khetId: number;
}

interface Named {
  id: number;
  isActive: boolean;
}

/** New entries need active masters; an edit may keep pointing at one deactivated since. */
function assertUsable<Row extends Named>(
  entity: string,
  row: Row | null,
  id: number,
  previousId: number | undefined,
  label: (row: Row) => string,
): Row {
  if (!row) throw notFound(entity, id);
  if (!row.isActive && row.id !== previousId) {
    throw new AppError("CONFLICT", `${entity} ${label(row)} is inactive`);
  }
  return row;
}

/**
 * Checks the customer, driver, tractor and khet a trip points at. Returns warnings for
 * things that are allowed but worth a second look.
 */
export async function checkTripMasters(
  tx: Tx,
  ids: TripMasterIds,
  previous?: TripMasterIds,
): Promise<string[]> {
  const [customer, driver, tractor, khet] = await Promise.all([
    tx.customer.findUnique({ where: { id: ids.customerId } }),
    tx.driver.findUnique({
      where: { id: ids.driverId },
      include: { defaultTractor: { select: { id: true, regNumber: true } } },
    }),
    tx.tractor.findUnique({ where: { id: ids.tractorId } }),
    tx.khet.findUnique({ where: { id: ids.khetId } }),
  ]);
  assertUsable("Customer", customer, ids.customerId, previous?.customerId, (row) => row.name);
  const usableDriver = assertUsable(
    "Driver",
    driver,
    ids.driverId,
    previous?.driverId,
    (row) => row.name,
  );
  const usableTractor = assertUsable(
    "Tractor",
    tractor,
    ids.tractorId,
    previous?.tractorId,
    (row) => row.regNumber,
  );
  assertUsable("Khet", khet, ids.khetId, previous?.khetId, (row) => row.name);

  const usual = usableDriver.defaultTractor;
  if (usual && usual.id !== usableTractor.id) {
    return [
      `${usableDriver.name} usually drives ${usual.regNumber}; this trip is on ${usableTractor.regNumber}`,
    ];
  }
  return [];
}
