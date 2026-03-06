import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { deriveAppointmentStatus } from "@/lib/vesselmanager/status";
import type { AppointmentTimelineRow, CreateTimelineInput } from "@/lib/vesselmanager/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateTimelineInput;

    if (!body?.appointment_id || !body?.event_type) {
      return NextResponse.json(
        { error: "appointment_id and event_type are required" },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();

    const { data: existing } = await supabase
      .from("appointment_timeline")
      .select("id")
      .eq("appointment_id", body.appointment_id)
      .eq("event_type", body.event_type)
      .maybeSingle();

    const payload = {
      appointment_id: body.appointment_id,
      event_type: body.event_type,
      eta: body.eta ?? null,
      ata: body.ata ?? null,
    };

    const timelineMutation = existing?.id
      ? supabase
          .from("appointment_timeline")
          .update({ eta: payload.eta, ata: payload.ata })
          .eq("id", existing.id)
          .select("id,appointment_id,event_type,eta,ata")
          .single()
      : supabase
          .from("appointment_timeline")
          .insert(payload)
          .select("id,appointment_id,event_type,eta,ata")
          .single();

    const { data, error } = await timelineMutation;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: timelineRowsRaw, error: timelineError } = await supabase
      .from("appointment_timeline")
      .select("id,appointment_id,event_type,eta,ata")
      .eq("appointment_id", body.appointment_id);

    if (timelineError) {
      return NextResponse.json({ error: timelineError.message }, { status: 500 });
    }

    const timelineRows = (timelineRowsRaw ?? []) as AppointmentTimelineRow[];
    const status = deriveAppointmentStatus(timelineRows);

    const { error: appointmentUpdateError } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", body.appointment_id);

    if (appointmentUpdateError) {
      return NextResponse.json({ error: appointmentUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ data, status }, { status: existing?.id ? 200 : 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create timeline event" },
      { status: 500 },
    );
  }
}
