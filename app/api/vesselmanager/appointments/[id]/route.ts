import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { deriveAppointmentStatus } from "@/lib/vesselmanager/status";
import type { AppointmentRecipient, AppointmentTimelineRow, CreateAppointmentInput } from "@/lib/vesselmanager/types";

const APPOINTMENT_SELECT_FULL =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,holds,appointment_datetime,charterer_agent,thanks_to,shiftreporter_link,other_agents,other_agents_role,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_NO_SHIFT_LINK =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,holds,appointment_datetime,charterer_agent,thanks_to,other_agents,other_agents_role,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_WITH_OTHER_AGENTS =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,charterer_agent,other_agents,other_agents_role,status,created_by,created_at";

const APPOINTMENT_SELECT_WITH_OTHER_ONLY =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,other_agents,other_agents_role,status,created_by,created_at";

const APPOINTMENT_SELECT_ALERT_SAFE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,charterer_agent,other_agents,other_agents_role,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_BASE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,status,created_by,created_at";

function isMissingOperationalColumns(message?: string) {
  if (!message) return false;
  return message.includes("event_date") || message.includes("event_time_text");
}

function isMissingShiftLinkColumn(message?: string) {
  if (!message) return false;
  return message.includes("shiftreporter_link");
}

function hasMissingAppointmentColumn(message?: string) {
  if (!message) return false;
  return (
    message.includes("holds") ||
    message.includes("appointment_datetime") ||
    message.includes("charterer_agent") ||
    message.includes("thanks_to") ||
    message.includes("shiftreporter_link") ||
    message.includes("other_agents") ||
    message.includes("notify_eta_suppliers") ||
    message.includes("needs_daily_prospect")
  );
}

function sanitizeRecipients(input: AppointmentRecipient[] | undefined) {
  if (!input || !Array.isArray(input)) return [];
  return input
    .filter((r) => (r.email || "").trim())
    .map((r) => ({
      category: r.category,
      name: r.name?.trim() || null,
      email: r.email.trim(),
      is_onetimer: !!r.is_onetimer,
    }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await supabaseServer();

    const [{ data: appointment, error: appointmentError }, timelineResult, recipientsResult] = await Promise.all([
      (async () => {
        const full = await supabase
          .from("appointments")
          .select(APPOINTMENT_SELECT_FULL)
          .eq("id", id)
          .single();

        if (!full.error) {
          return full;
        }

        if (isMissingShiftLinkColumn(full.error.message) || hasMissingAppointmentColumn(full.error.message)) {
          const noShift = await supabase
            .from("appointments")
            .select(APPOINTMENT_SELECT_NO_SHIFT_LINK)
            .eq("id", id)
            .single();
          if (!noShift.error) return noShift;

          const alertSafe = await supabase
            .from("appointments")
            .select(APPOINTMENT_SELECT_ALERT_SAFE)
            .eq("id", id)
            .single();
          if (!alertSafe.error) return alertSafe;

          const withOtherAgents = await supabase
            .from("appointments")
            .select(APPOINTMENT_SELECT_WITH_OTHER_AGENTS)
            .eq("id", id)
            .single();
          if (!withOtherAgents.error) return withOtherAgents;

          const withOtherOnly = await supabase
            .from("appointments")
            .select(APPOINTMENT_SELECT_WITH_OTHER_ONLY)
            .eq("id", id)
            .single();
          if (!withOtherOnly.error) return withOtherOnly;
        }

        if (!hasMissingAppointmentColumn(full.error.message)) {
          return full;
        }

        return supabase
          .from("appointments")
          .select(APPOINTMENT_SELECT_BASE)
          .eq("id", id)
          .single();
      })(),
      (async () => {
        const withOperational = await supabase
          .from("appointment_timeline")
          .select("id,appointment_id,event_type,eta,ata,event_date,event_time_text")
          .eq("appointment_id", id)
          .order("eta", { ascending: true, nullsFirst: false });

        if (!withOperational.error || !isMissingOperationalColumns(withOperational.error.message)) {
          return withOperational;
        }

        return supabase
          .from("appointment_timeline")
          .select("id,appointment_id,event_type,eta,ata")
          .eq("appointment_id", id)
          .order("eta", { ascending: true, nullsFirst: false });
      })(),
      supabase
        .from("appointment_recipients")
        .select("id,appointment_id,category,name,email,is_onetimer")
        .eq("appointment_id", id)
        .order("created_at", { ascending: true }),
    ]);

    if (appointmentError) {
      const status = appointmentError.code === "PGRST116" ? 404 : 500;
      return NextResponse.json({ error: appointmentError.message }, { status });
    }

    if (timelineResult.error) {
      return NextResponse.json({ error: timelineResult.error.message }, { status: 500 });
    }

    const timelineRows = (timelineResult.data ?? []) as AppointmentTimelineRow[];
    const derivedStatus = deriveAppointmentStatus(timelineRows);

    const recipients = recipientsResult.error
      ? []
      : ((recipientsResult.data ?? []) as AppointmentRecipient[]);

    return NextResponse.json({
      data: {
        appointment: { ...appointment, status: derivedStatus },
        timeline: timelineRows,
        recipients,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch appointment" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as CreateAppointmentInput;

    if (!body?.vessel_name?.trim()) {
      return NextResponse.json({ error: "vessel_name is required" }, { status: 400 });
    }

    const supabase = await supabaseServer();

    const payload = {
      vessel_name: body.vessel_name.trim(),
      role: body.role?.trim() || "AGENT",
      appointed_by: body.appointed_by?.trim() || "AGENT",
      port: body.port?.trim() || null,
      terminal: body.terminal?.trim() || null,
      cargo_operation: body.cargo_operation?.trim() || null,
      cargo_grade: body.cargo_grade?.trim() || null,
      cargo_qty: body.cargo_qty ?? null,
      holds: body.holds ?? null,
      appointment_datetime: body.appointment_datetime || null,
      charterer_agent: body.charterer_agent?.trim() || null,
      thanks_to: body.thanks_to?.trim() || null,
      shiftreporter_link: body.shiftreporter_link?.trim() || null,
      other_agents: body.other_agents?.trim() || null,
      other_agents_role: body.other_agents_role?.trim() || null,
      notify_eta_suppliers: !!body.notify_eta_suppliers,
      notify_eta_agents_terminals: !!body.notify_eta_agents_terminals,
      notify_none: !!body.notify_none,
      needs_daily_prospect: body.needs_daily_prospect ?? true,
    };

    let updateResult = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", id)
      .select(APPOINTMENT_SELECT_FULL)
      .single();

    const isUniqueViolation = updateResult.error?.code === "23505";
    if (isUniqueViolation) {
      return NextResponse.json(
        { error: "An appointment with the same vessel, port and date-time already exists." },
        { status: 409 },
      );
    }

    if (updateResult.error && isMissingShiftLinkColumn(updateResult.error.message)) {
      const noShiftPayload = { ...payload };
      delete (noShiftPayload as Partial<typeof noShiftPayload>).shiftreporter_link;
      updateResult = await supabase
        .from("appointments")
        .update(noShiftPayload)
        .eq("id", id)
        .select(APPOINTMENT_SELECT_NO_SHIFT_LINK)
        .single();
    }

    if (updateResult.error && hasMissingAppointmentColumn(updateResult.error.message)) {
      const alertSafePayload = {
        vessel_name: payload.vessel_name,
        role: payload.role,
        appointed_by: payload.appointed_by,
        port: payload.port,
        terminal: payload.terminal,
        cargo_operation: payload.cargo_operation,
        cargo_grade: payload.cargo_grade,
        cargo_qty: payload.cargo_qty,
        charterer_agent: payload.charterer_agent,
        other_agents: payload.other_agents,
        other_agents_role: payload.other_agents_role,
        notify_eta_suppliers: payload.notify_eta_suppliers,
        notify_eta_agents_terminals: payload.notify_eta_agents_terminals,
        notify_none: payload.notify_none,
        needs_daily_prospect: payload.needs_daily_prospect,
      };

      const alertSafeUpdate = await supabase
        .from("appointments")
        .update(alertSafePayload)
        .eq("id", id)
        .select(APPOINTMENT_SELECT_ALERT_SAFE)
        .single();

      if (!alertSafeUpdate.error) {
        return NextResponse.json({ data: alertSafeUpdate.data });
      }

      const fallbackPayload = {
        vessel_name: payload.vessel_name,
        role: payload.role,
        appointed_by: payload.appointed_by,
        port: payload.port,
        terminal: payload.terminal,
        cargo_operation: payload.cargo_operation,
        cargo_grade: payload.cargo_grade,
        cargo_qty: payload.cargo_qty,
        charterer_agent: payload.charterer_agent,
        other_agents: payload.other_agents,
        other_agents_role: payload.other_agents_role,
      };

      const fallbackUpdate = await supabase
        .from("appointments")
        .update(fallbackPayload)
        .eq("id", id)
        .select(APPOINTMENT_SELECT_BASE)
        .single();

      if (fallbackUpdate.error) {
        return NextResponse.json({ error: fallbackUpdate.error.message }, { status: 500 });
      }

      return NextResponse.json({ data: fallbackUpdate.data });
    }

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    const recipients = sanitizeRecipients(body.recipients);
    const deleteResult = await supabase.from("appointment_recipients").delete().eq("appointment_id", id);
    if (deleteResult.error && !deleteResult.error.message.includes("appointment_recipients")) {
      return NextResponse.json({ error: deleteResult.error.message }, { status: 500 });
    }

    if (recipients.length) {
      const insertRecipients = await supabase.from("appointment_recipients").insert(
        recipients.map((recipient) => ({
          appointment_id: id,
          ...recipient,
        })),
      );
      if (insertRecipients.error && !insertRecipients.error.message.includes("appointment_recipients")) {
        return NextResponse.json({ error: insertRecipients.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ data: updateResult.data });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update appointment" },
      { status: 500 },
    );
  }
}
