import type { AppointmentStatus, AppointmentTimelineRow } from "@/lib/vesselmanager/types";

export function deriveAppointmentStatus(timeline: AppointmentTimelineRow[]): AppointmentStatus {
  const hasAta = (eventType: AppointmentTimelineRow["event_type"]) =>
    timeline.some((row) => row.event_type === eventType && !!row.ata);
  const hasAny = (eventType: AppointmentTimelineRow["event_type"]) =>
    timeline.some((row) => row.event_type === eventType && (!!row.ata || !!row.eta));

  if (hasAta("ETD")) return "SAILED";
  if (hasAta("ETB")) return "ALONGSIDE";
  if (hasAta("ETA_RIVER")) return "IN PORT";
  if (hasAta("EPOB")) return "ANCHORED OUTER ROADS";
  if (hasAny("ETA_OUTER_ROADS")) return "EN ROUTE";
  return "EN ROUTE";
}
