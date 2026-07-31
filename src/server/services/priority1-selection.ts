import type { P1ShipmentStatus, StatusResponse } from "./priority1";

export class Priority1ShipmentMatchError extends Error {
  constructor(message: string) {
    super(`MANUAL_REVIEW_REQUIRED: ${message}`);
    this.name = "Priority1ShipmentMatchError";
  }
}

/**
 * Select the only provider shipment that can safely represent a local row.
 *
 * Customer references are not guaranteed to be unique forever. Once a local
 * provider ID exists, it is authoritative and must match exactly. Before an ID
 * has been persisted, reconciliation is safe only when Priority1 returns one
 * unambiguous candidate.
 */
export function selectPriority1Shipment(
  response: StatusResponse,
  expectedShipmentId?: string | null,
): P1ShipmentStatus | null {
  const candidates = response.shipments ?? [];
  if (expectedShipmentId) {
    const exactMatches = candidates.filter(
      (shipment) => String(shipment.id) === expectedShipmentId,
    );
    if (exactMatches.length !== 1) {
      throw new Priority1ShipmentMatchError(
        `expected Priority1 shipment ${expectedShipmentId}, but received ${candidates.length} candidate(s) and ${exactMatches.length} exact match(es)`,
      );
    }
    return exactMatches[0]!;
  }

  if (candidates.length === 0) return null;
  if (candidates.length !== 1) {
    throw new Priority1ShipmentMatchError(
      `expected exactly one Priority1 shipment candidate, but received ${candidates.length}`,
    );
  }
  return candidates[0]!;
}
