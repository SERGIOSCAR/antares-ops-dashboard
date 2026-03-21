import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { extractShortId } from "@/lib/shiftreporter/sync-vessel-from-appointment";

function isMissingShiftLinkColumn(message?: string) {
  if (!message) return false;
  return message.includes("shiftreporter_link");
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let appointmentRes = await supabase
      .from("appointments")
      .select("id,vessel_name,port,terminal,cargo_operation,cargo_grade,holds,shiftreporter_link")
      .eq("id", id)
      .single();

    if (appointmentRes.error && isMissingShiftLinkColumn(appointmentRes.error.message)) {
      appointmentRes = await supabase
        .from("appointments")
        .select("id,vessel_name,port,terminal,cargo_operation,cargo_grade,holds")
        .eq("id", id)
        .single();
    }

    const appointment = appointmentRes.data as
      | {
          id: string;
          vessel_name: string;
          port: string | null;
          terminal: string | null;
          cargo_operation: string | null;
          cargo_grade: string | null;
          holds: number | null;
          shiftreporter_link?: string | null;
        }
      | null;
    const appointmentError = appointmentRes.error;

    if (appointmentError || !appointment) {
      return NextResponse.json({ error: appointmentError?.message || "Appointment not found" }, { status: 404 });
    }

    let linkedVesselRes = await supabase
      .from("vessels")
      .select("id,short_id")
      .eq("appointment_id", id)
      .maybeSingle();
    if (linkedVesselRes.error && !String(linkedVesselRes.error.message || "").includes("appointment_id")) {
      return NextResponse.json({ error: linkedVesselRes.error.message }, { status: 500 });
    }

    if (!linkedVesselRes.data) {
      const shortId = extractShortId(appointment.shiftreporter_link);
      if (shortId) {
        linkedVesselRes = await supabase.from("vessels").select("id,short_id").eq("short_id", shortId).maybeSingle();
        if (linkedVesselRes.error) {
          return NextResponse.json({ error: linkedVesselRes.error.message }, { status: 500 });
        }
      }
    }

    if (linkedVesselRes.data?.short_id) {
      const persistedLink = `/v/${linkedVesselRes.data.short_id}`;
      const { error: updateError } = await supabase.from("appointments").update({ shiftreporter_link: persistedLink }).eq("id", id);
      if (updateError && !isMissingShiftLinkColumn(updateError.message)) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ data: { link: `${persistedLink}?appointment_id=${id}` } });
    }

    const fallbackLink = `/shiftreporter?appointment_id=${id}`;
    const { error: updateError } = await supabase.from("appointments").update({ shiftreporter_link: fallbackLink }).eq("id", id);
    if (updateError && !isMissingShiftLinkColumn(updateError.message)) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ data: { link: fallbackLink } });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate shift report link" },
      { status: 500 },
    );
  }
}
