import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabase/require-user";
import { deriveAppointmentStatus } from "@/lib/vesselmanager/status";
import type { AppointmentTimelineRow, CreateTimelineInput } from "@/lib/vesselmanager/types";

function isMissingOperationalColumns(message?: string) {
  if (!message) return false;
  return message.includes("event_date") || message.includes("event_time_text");
}

function deriveOperationalFields(body: CreateTimelineInput) {
  if (body.event_date !== undefined || body.event_time_text !== undefined) {
    return {
      event_date: body.event_date ?? null,
      event_time_text: body.event_time_text ?? null,
    };
  }

  const source = body.ata ?? body.eta ?? null;
  if (!source) return { event_date: null, event_time_text: null };

  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) return { event_date: null, event_time_text: null };

  const event_date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const event_time_text = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  return { event_date, event_time_text };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateTimelineInput;

    if (!body?.appointment_id || !body?.event_type) {
      return NextResponse.json(
        { error: "appointment_id and event_type are required" },
        { status: 400 },
      );
    }

    const { supabase, user } = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      ...deriveOperationalFields(body),
    };

    const withOperationalMutation = existing?.id
      ? supabase
          .from("appointment_timeline")
          .update({
            eta: payload.eta,
            ata: payload.ata,
            event_date: payload.event_date,
            event_time_text: payload.event_time_text,
          })
          .eq("id", existing.id)
          .select("id,appointment_id,event_type,eta,ata,event_date,event_time_text")
          .single()
      : supabase
          .from("appointment_timeline")
          .insert(payload)
          .select("id,appointment_id,event_type,eta,ata,event_date,event_time_text")
          .single();

    let data: any = null;
    let error: any = null;
    ({ data, error } = await withOperationalMutation);

    if (error && isMissingOperationalColumns(error.message)) {
      const legacyEta = payload.eta ?? (payload.ata ? null : payload.event_time_text ?? null);
      const legacyAta = payload.ata ?? null;
      const legacyMutation = existing?.id
        ? supabase
            .from("appointment_timeline")
            .update({ eta: legacyEta, ata: legacyAta })
            .eq("id", existing.id)
            .select("id,appointment_id,event_type,eta,ata")
            .single()
        : supabase
            .from("appointment_timeline")
            .insert({
              appointment_id: payload.appointment_id,
              event_type: payload.event_type,
              eta: legacyEta,
              ata: legacyAta,
            })
            .select("id,appointment_id,event_type,eta,ata")
            .single();

      ({ data, error } = await legacyMutation);
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withOperationalTimeline = await supabase
      .from("appointment_timeline")
      .select("id,appointment_id,event_type,eta,ata,event_date,event_time_text")
      .eq("appointment_id", body.appointment_id);

    let timelineRowsRaw: any[] | null = withOperationalTimeline.data as any[] | null;
    let timelineError = withOperationalTimeline.error;

    if (timelineError && isMissingOperationalColumns(timelineError.message)) {
      const legacyTimeline = await supabase
        .from("appointment_timeline")
        .select("id,appointment_id,event_type,eta,ata")
        .eq("appointment_id", body.appointment_id);
      timelineRowsRaw = legacyTimeline.data;
      timelineError = legacyTimeline.error;
    }

    if (timelineError) {
      return NextResponse.json({ error: timelineError.message }, { status: 500 });
    }

    const timelineRows = (timelineRowsRaw ?? []) as AppointmentTimelineRow[];
    let status = deriveAppointmentStatus(timelineRows);
    const checklistCompleted = timelineRows.some((row) => row.event_type === "COMPLETE_OPS" && !!row.ata);
    if (checklistCompleted) {
      status = "CLOSED";
    }

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
