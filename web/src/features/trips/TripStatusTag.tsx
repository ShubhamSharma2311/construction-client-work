import { Tag, type TagTone } from "../../ui/Tag.tsx";
import { TRIP_STATUS_LABELS, type TripStatus } from "./tripFilters.ts";

const TONES: Record<TripStatus, TagTone> = { DUE: "owed", PARTIAL: "partial", PAID: "received" };

export function TripStatusTag({ status }: { status: TripStatus }) {
  return <Tag tone={TONES[status]}>{TRIP_STATUS_LABELS[status]}</Tag>;
}
