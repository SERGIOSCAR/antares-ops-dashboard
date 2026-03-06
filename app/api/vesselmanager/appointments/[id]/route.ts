import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { deriveAppointmentStatus } from "@/lib/vesselmanager/status";
import type { AppointmentTimelineRow } from "@/lib/vesselmanager/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await supabaseServer();

    const [{ data: appointment, error: appointmentError }, { data: timeline, error: timelineError }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,status,created_by,created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("appointment_timeline")
        .select("id,appointment_id,event_type,eta,ata")
        .eq("appointment_id", id)
        .order("eta", { ascending: true, nullsFirst: false }),
    ]);

    if (appointmentError) {
      const status = appointmentError.code === "PGRST116" ? 404 : 500;
      return NextResponse.json({ error: appointmentError.message }, { status });
    }

    if (timelineError) {
      return NextResponse.json({ error: timelineError.message }, { status: 500 });
    }

    const timelineRows = (timeline ?? []) as AppointmentTimelineRow[];
    const derivedStatus = deriveAppointmentStatus(timelineRows);

    return NextResponse.json({
      data: {
        appointment: { ...appointment, status: derivedStatus },
        timeline: timelineRows,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch appointment" },
      { status: 500 },
    );
  }
}
