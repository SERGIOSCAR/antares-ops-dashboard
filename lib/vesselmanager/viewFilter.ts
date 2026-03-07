import type { Appointment } from "@/lib/vesselmanager/types";
import type { View } from "@/app/vesselmanager/components/ViewSelector";

export function filterAppointments(
  view: View,
  data: Appointment[],
  currentUser?: string | null,
) {
  const withFlags = data as Array<
    Appointment & {
      etd_ata?: string | null;
      epob_ata?: string | null;
      followed_by_user?: boolean | null;
    }
  >;

  if (view === "board") {
    return withFlags.filter((a) => !a.etd_ata && a.status !== "CLOSED" && a.status !== "SAILING");
  }

  if (view === "my") {
    if (!currentUser) return withFlags;
    return withFlags.filter((a) => a.created_by === currentUser);
  }

  if (view === "followed") {
    return withFlags.filter((a) => a.followed_by_user === true);
  }

  if (view === "inport") {
    return withFlags.filter((a) => !!a.epob_ata && !a.etd_ata);
  }

  if (view === "active") {
    return withFlags.filter((a) => !a.etd_ata && a.status !== "CLOSED" && a.status !== "SAILING");
  }

  if (view === "sailed") {
    return withFlags.filter((a) => !!a.etd_ata || a.status === "CLOSED" || a.status === "SAILING");
  }

  return withFlags;
}
