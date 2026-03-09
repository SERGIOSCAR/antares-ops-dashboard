import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppointmentRecipient, CreateAppointmentInput, EtaNoticeLine, EtaNoticeSettings } from "@/lib/vesselmanager/types";

const APPOINTMENT_SELECT_FULL =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,holds,appointment_datetime,charterer_agent,thanks_to,shiftreporter_link,other_agents,other_agents_role,sub_agent_id,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_NO_SHIFT_LINK =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,holds,appointment_datetime,charterer_agent,thanks_to,other_agents,other_agents_role,sub_agent_id,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_ALERT_SAFE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,charterer_agent,other_agents,other_agents_role,sub_agent_id,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_AGENTS_SAFE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,charterer_agent,other_agents,other_agents_role,sub_agent_id,status,created_by,created_at";

const APPOINTMENT_SELECT_OTHER_ONLY_SAFE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,other_agents,other_agents_role,sub_agent_id,status,created_by,created_at";

const APPOINTMENT_SELECT_BASE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,sub_agent_id,status,created_by,created_at";

function hasMissingColumnError(message?: string) {
  if (!message) return false;
  return (
    message.includes("holds") ||
    message.includes("appointment_datetime") ||
    message.includes("charterer_agent") ||
    message.includes("thanks_to") ||
    message.includes("shiftreporter_link") ||
    message.includes("other_agents") ||
    message.includes("sub_agent_id") ||
    message.includes("notify_eta_suppliers") ||
    message.includes("needs_daily_prospect")
  );
}

function isMissingShiftLinkColumn(message?: string) {
  if (!message) return false;
  return message.includes("shiftreporter_link");
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

function sanitizeEtaNotice(input: EtaNoticeSettings | undefined) {
  if (!input) return null;
  const lines = Array.isArray(input.lines)
    ? input.lines
        .map((line: EtaNoticeLine) => ({
          supplier_name: String(line.supplier_name || "").trim(),
          supplier_emails: String(line.supplier_emails || "").trim(),
          service_name: String(line.service_name || "").trim(),
          in_mode: line.in_mode === "yes" || line.in_mode === "qty" ? line.in_mode : "none",
          in_qty: line.in_mode === "qty" ? Number(line.in_qty || 0) : null,
          out_mode: line.out_mode === "yes" || line.out_mode === "qty" ? line.out_mode : "none",
          out_qty: line.out_mode === "qty" ? Number(line.out_qty || 0) : null,
          trigger_eta_eosp: !!line.trigger_eta_eosp,
          trigger_epob: !!line.trigger_epob,
          trigger_etb: !!line.trigger_etb,
          trigger_etd: !!line.trigger_etd,
          trigger_eta_bunker: !!line.trigger_eta_bunker,
          is_active: line.is_active === undefined ? true : !!line.is_active,
        }))
        .filter((line) => line.service_name && line.supplier_name && line.supplier_emails)
    : [];
  return {
    enabled: input.enabled === undefined ? true : !!input.enabled,
    first_service_starts_at: input.first_service_starts_at || null,
    last_service_ends_at: input.last_service_ends_at || null,
    lines,
  };
}

async function saveEtaNotice(supabase: Awaited<ReturnType<typeof supabaseServer>>, appointmentId: string, etaNotice?: EtaNoticeSettings) {
  const parsed = sanitizeEtaNotice(etaNotice);
  if (!parsed) return;

  const upsertSettings = await supabase.from("appointment_eta_notice_settings").upsert(
    {
      appointment_id: appointmentId,
      enabled: parsed.enabled,
      first_service_starts_at: parsed.first_service_starts_at,
      last_service_ends_at: parsed.last_service_ends_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "appointment_id" },
  );
  if (upsertSettings.error && !upsertSettings.error.message.includes("appointment_eta_notice_settings")) {
    throw new Error(upsertSettings.error.message);
  }

  const deleteLines = await supabase.from("appointment_eta_notice_lines").delete().eq("appointment_id", appointmentId);
  if (deleteLines.error && !deleteLines.error.message.includes("appointment_eta_notice_lines")) {
    throw new Error(deleteLines.error.message);
  }

  if (parsed.lines.length) {
    const insertLines = await supabase.from("appointment_eta_notice_lines").insert(
      parsed.lines.map((line) => ({
        appointment_id: appointmentId,
        ...line,
      })),
    );
    if (insertLines.error && !insertLines.error.message.includes("appointment_eta_notice_lines")) {
      throw new Error(insertLines.error.message);
    }
  }
}

function mapOperationType(input?: string | null): "LOAD" | "DISCHARGE" {
  const normalized = (input || "").trim().toUpperCase();
  if (normalized === "DISCH" || normalized === "DISCHARGE") return "DISCHARGE";
  return "LOAD";
}

function splitCargoGrades(input?: string | null) {
  if (!input) return [];
  return input
    .split(",")
    .map((grade) => grade.trim())
    .filter(Boolean);
}

function sanitizeInt(input: unknown, maxDigits: number) {
  if (input === null || input === undefined || input === "") return null;
  const digits = String(input).replace(/\D/g, "").slice(0, maxDigits);
  if (!digits) return null;
  return Number(digits);
}

async function provisionShiftReporterVessel(args: {
  appointmentId: string;
  vesselName: string;
  port?: string | null;
  terminal?: string | null;
  cargoOperation?: string | null;
  cargoGrade?: string | null;
  holds?: number | null;
  createdBy?: string | null;
}) {
  const admin = supabaseAdmin();
  const shortId = nanoid(10);

  const { error } = await admin.from("vessels").insert({
    short_id: shortId,
    name: args.vesselName,
    port: args.port || "TBC",
    terminal: args.terminal || "TBC",
    operation_type: mapOperationType(args.cargoOperation),
    cargo_grades: splitCargoGrades(args.cargoGrade),
    holds: args.holds && args.holds > 0 ? args.holds : 1,
    shift_type: "00-06/06-12/12-18/18-24",
    default_recipients: [],
    created_by: args.createdBy || null,
    commenced_at: new Date().toISOString(),
  });

  if (error) throw error;
  return `/v/${shortId}`;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();

    let query: { data: any[] | null; error: { message: string } | null } = (await supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT_FULL)
      .order("created_at", { ascending: false })) as any;

    if (query.error && isMissingShiftLinkColumn(query.error.message)) {
      query = (await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT_NO_SHIFT_LINK)
        .order("created_at", { ascending: false })) as any;
    }

    if (query.error && hasMissingColumnError(query.error.message)) {
      query = (await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT_ALERT_SAFE)
        .order("created_at", { ascending: false })) as any;
    }

    if (query.error && hasMissingColumnError(query.error.message)) {
      query = (await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT_AGENTS_SAFE)
        .order("created_at", { ascending: false })) as any;
    }

    if (query.error && hasMissingColumnError(query.error.message)) {
      query = (await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT_OTHER_ONLY_SAFE)
        .order("created_at", { ascending: false })) as any;
    }

    if (query.error && hasMissingColumnError(query.error.message)) {
      query = (await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT_BASE)
        .order("created_at", { ascending: false })) as any;
    }

    if (query.error) {
      return NextResponse.json({ error: query.error.message }, { status: 500 });
    }

    return NextResponse.json({ data: query.data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch appointments" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateAppointmentInput;

    if (!body?.vessel_name?.trim()) {
      return NextResponse.json({ error: "vessel_name is required" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const appointmentId = crypto.randomUUID();
    const fallbackShiftReporterLink = `/shiftreporter?appointment_id=${appointmentId}`;
    const payload = {
      id: appointmentId,
      vessel_name: body.vessel_name.trim(),
      role: body.role?.trim() || "AGENT",
      appointed_by: body.appointed_by?.trim() || "AGENT",
      port: body.port?.trim() || null,
      terminal: body.terminal?.trim() || null,
      cargo_operation: body.cargo_operation?.trim() || null,
      cargo_grade: body.cargo_grade?.trim() || null,
      cargo_qty: sanitizeInt(body.cargo_qty, 6),
      holds: sanitizeInt(body.holds, 2),
      appointment_datetime: body.appointment_datetime || new Date().toISOString(),
      charterer_agent: body.charterer_agent?.trim() || null,
      thanks_to: body.thanks_to?.trim() || null,
      shiftreporter_link: body.shiftreporter_link?.trim() || fallbackShiftReporterLink,
      other_agents: body.other_agents?.trim() || null,
      other_agents_role: body.other_agents_role?.trim() || null,
      sub_agent_id: body.sub_agent_id || null,
      notify_eta_suppliers:
        body.notify_eta_suppliers === null || body.notify_eta_suppliers === undefined
          ? true
          : !!body.notify_eta_suppliers,
      notify_eta_agents_terminals:
        body.notify_eta_agents_terminals === null || body.notify_eta_agents_terminals === undefined
          ? true
          : !!body.notify_eta_agents_terminals,
      notify_none: !!body.notify_none,
      needs_daily_prospect:
        body.needs_daily_prospect === null || body.needs_daily_prospect === undefined
          ? true
          : !!body.needs_daily_prospect,
      status: body.status ?? "EN ROUTE",
    };

    let insertRes = await supabase
      .from("appointments")
      .insert(payload)
      .select(APPOINTMENT_SELECT_FULL)
      .single();

    const isUniqueViolation = insertRes.error?.code === "23505";
    if (isUniqueViolation) {
      return NextResponse.json(
        { error: "An appointment with the same vessel, port and date-time already exists." },
        { status: 409 },
      );
    }

    if (insertRes.error && isMissingShiftLinkColumn(insertRes.error.message)) {
      const noShiftPayload = { ...payload };
      delete (noShiftPayload as Partial<typeof noShiftPayload>).shiftreporter_link;
      insertRes = await supabase
        .from("appointments")
        .insert(noShiftPayload)
        .select(APPOINTMENT_SELECT_NO_SHIFT_LINK)
        .single();
    }

    if (insertRes.error && hasMissingColumnError(insertRes.error.message)) {
      const fallbackPayload = {
        id: payload.id,
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
        sub_agent_id: payload.sub_agent_id,
        status: payload.status,
      };

      const fallbackInsert = await supabase
        .from("appointments")
        .insert(fallbackPayload)
        .select(APPOINTMENT_SELECT_BASE)
        .single();

      if (fallbackInsert.error) {
        return NextResponse.json({ error: fallbackInsert.error.message }, { status: 500 });
      }

      return NextResponse.json({ data: fallbackInsert.data }, { status: 201 });
    }

    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }

    let shiftLink = insertRes.data.shiftreporter_link || fallbackShiftReporterLink;
    try {
      shiftLink = await provisionShiftReporterVessel({
        appointmentId: insertRes.data.id,
        vesselName: payload.vessel_name,
        port: payload.port,
        terminal: payload.terminal,
        cargoOperation: payload.cargo_operation,
        cargoGrade: payload.cargo_grade,
        holds: payload.holds,
        createdBy: user?.id,
      });

      await supabase
        .from("appointments")
        .update({ shiftreporter_link: shiftLink })
        .eq("id", insertRes.data.id);
    } catch {
      // keep fallback link if ShiftReporter vessel provisioning fails
    }

    const recipients = sanitizeRecipients(body.recipients);
    if (recipients.length) {
      const recipientsResult = await supabase.from("appointment_recipients").insert(
        recipients.map((recipient) => ({
          appointment_id: insertRes.data.id,
          ...recipient,
        })),
      );

      if (recipientsResult.error && !recipientsResult.error.message.includes("appointment_recipients")) {
        return NextResponse.json({ error: recipientsResult.error.message }, { status: 500 });
      }
    }

    try {
      await saveEtaNotice(supabase, insertRes.data.id, body.eta_notice);
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save ETA notices" }, { status: 500 });
    }

    return NextResponse.json(
      { data: { ...insertRes.data, shiftreporter_link: shiftLink } },
      { status: 201 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create appointment" },
      { status: 500 },
    );
  }
}
