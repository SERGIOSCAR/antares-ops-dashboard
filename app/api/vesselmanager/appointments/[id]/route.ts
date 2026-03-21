import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/supabase/require-user";
import { deriveAppointmentStatus } from "@/lib/vesselmanager/status";
import type {
  AppointmentRecipient,
  AppointmentTimelineRow,
  CreateAppointmentInput,
  EtaNoticeLine,
  EtaNoticeSettings,
} from "@/lib/vesselmanager/types";

const APPOINTMENT_SELECT_FULL =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,holds,appointment_datetime,charterer_agent,thanks_to,shiftreporter_link,other_agents,other_agents_role,sub_agent_id,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_NO_SHIFT_LINK =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,holds,appointment_datetime,charterer_agent,thanks_to,other_agents,other_agents_role,sub_agent_id,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_WITH_OTHER_AGENTS =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,charterer_agent,other_agents,other_agents_role,sub_agent_id,status,created_by,created_at";

const APPOINTMENT_SELECT_WITH_OTHER_ONLY =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,other_agents,other_agents_role,sub_agent_id,status,created_by,created_at";

const APPOINTMENT_SELECT_ALERT_SAFE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,charterer_agent,other_agents,other_agents_role,sub_agent_id,notify_eta_suppliers,notify_eta_agents_terminals,notify_none,needs_daily_prospect,status,created_by,created_at";

const APPOINTMENT_SELECT_BASE =
  "id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,sub_agent_id,status,created_by,created_at";

function isMissingOperationalColumns(message?: string) {
  if (!message) return false;
  return message.includes("event_date") || message.includes("event_time_text");
}

function isMissingShiftLinkColumn(message?: string) {
  if (!message) return false;
  return message.includes("shiftreporter_link");
}

function isMissingAccountingColumn(message?: string) {
  if (!message) return false;
  return (
    message.includes("appointment_accounting") ||
    message.includes("accounting_reference") ||
    message.includes("nomination_received_on") ||
    message.includes("operator_initials")
  );
}

function isMissingVesselAppointmentColumn(message?: string) {
  if (!message) return false;
  return message.includes("appointment_id");
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
    message.includes("sub_agent_id") ||
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

function sanitizeInt(input: unknown, maxDigits: number) {
  if (input === null || input === undefined || input === "") return null;
  const digits = String(input).replace(/\D/g, "").slice(0, maxDigits);
  if (!digits) return null;
  return Number(digits);
}

function sanitizeDate(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const raw = String(input).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function extractShortId(link?: string | null) {
  const raw = String(link || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/v\/([^/?#]+)/i);
  return match?.[1] || "";
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

const DRAFT_META_GRADE = new Set(["__META_DRAFT_FWD__", "__META_DRAFT_MEAN__", "__META_DRAFT_AFT__"]);

async function findLinkedShiftReporterVessel(appointmentId: string, shiftreporterLink?: string | null) {
  const admin = supabaseAdmin();

  const byAppointment = await admin
    .from("vessels")
    .select("id,short_id,name,port,terminal,operation_type,holds,cargo_grades,commenced_at")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (byAppointment.error && !isMissingVesselAppointmentColumn(byAppointment.error.message)) {
    throw new Error(byAppointment.error.message);
  }
  if (byAppointment.data) return byAppointment.data;

  const shortId = extractShortId(shiftreporterLink);
  if (!shortId) return null;

  const byShortId = await admin
    .from("vessels")
    .select("id,short_id,name,port,terminal,operation_type,holds,cargo_grades,commenced_at")
    .eq("short_id", shortId)
    .maybeSingle();
  if (byShortId.error) throw new Error(byShortId.error.message);
  return byShortId.data;
}

async function prepareLinkedShiftReporterVesselSync(args: {
  appointmentId: string;
  currentAppointment: {
    vessel_name?: string | null;
    port?: string | null;
    terminal?: string | null;
    cargo_operation?: string | null;
    cargo_grade?: string | null;
    holds?: number | null;
    shiftreporter_link?: string | null;
  };
  nextPayload: {
    vessel_name: string;
    port: string | null;
    terminal: string | null;
    cargo_operation: string | null;
    cargo_grade: string | null;
    holds: number | null;
    shiftreporter_link: string | null;
  };
}) {
  const admin = supabaseAdmin();
  const linkedVessel = await findLinkedShiftReporterVessel(args.appointmentId, args.currentAppointment.shiftreporter_link);
  if (!linkedVessel) return args.nextPayload.shiftreporter_link;

  const nextLink = `/v/${linkedVessel.short_id}`;
  const currentHolds = Number(args.currentAppointment.holds || 0);
  const nextHolds = Number(args.nextPayload.holds || 0);
  const currentGrades = splitCargoGrades(args.currentAppointment.cargo_grade).join("|");
  const nextGrades = splitCargoGrades(args.nextPayload.cargo_grade).join("|");
  const holdsChange = currentHolds !== nextHolds;
  const gradeChange = currentGrades !== nextGrades;

  const shiftCountRes = await admin
    .from("shift_reports")
    .select("id", { count: "exact", head: true })
    .eq("vessel_id", linkedVessel.id);
  if (shiftCountRes.error) throw new Error(shiftCountRes.error.message);
  const shiftCount = Number(shiftCountRes.count || 0);

  if (holdsChange && shiftCount > 0) {
    throw new Error(
      "Cannot change holds after ShiftReporter activity has started. Cargo grades can still be refined operationally from ShiftReporter, but holds remain structural.",
    );
  }

  return {
    linkedVesselId: String(linkedVessel.id),
    nextLink,
    holdsChange,
    gradeChange,
    hasShiftActivity: shiftCount > 0,
  };
}

async function applyLinkedShiftReporterVesselSync(args: {
  appointmentId: string;
  linkedVesselId: string;
  holdsChange: boolean;
  gradeChange: boolean;
  hasShiftActivity: boolean;
  nextPayload: {
    vessel_name: string;
    port: string | null;
    terminal: string | null;
    cargo_operation: string | null;
    cargo_grade: string | null;
    holds: number | null;
  };
}) {
  const admin = supabaseAdmin();
  const nextHolds = Number(args.nextPayload.holds || 0);

  const updateRes = await admin
    .from("vessels")
    .update({
      appointment_id: args.appointmentId,
      name: args.nextPayload.vessel_name,
      port: args.nextPayload.port || "TBC",
      terminal: args.nextPayload.terminal || "TBC",
      operation_type: mapOperationType(args.nextPayload.cargo_operation),
      ...(args.hasShiftActivity
        ? {}
        : {
            holds: nextHolds > 0 ? nextHolds : 1,
            cargo_grades: splitCargoGrades(args.nextPayload.cargo_grade),
          }),
    })
    .eq("id", args.linkedVesselId);
  if (updateRes.error && !isMissingVesselAppointmentColumn(updateRes.error.message)) {
    throw new Error(updateRes.error.message);
  }

  if (args.hasShiftActivity || (!args.holdsChange && !args.gradeChange)) return;

  const stowRes = await admin
    .from("stow_plans")
    .select("id,hold,grade,total_mt,condition,draft_fwd,draft_mean,draft_aft")
    .eq("vessel_id", args.linkedVesselId)
    .order("hold", { ascending: true });
  if (stowRes.error) throw new Error(stowRes.error.message);

  const activeRows = (stowRes.data ?? []).filter((row: any) => !DRAFT_META_GRADE.has(String(row?.grade || "")));
  const preservedDraftSource = activeRows[0] || null;
  const nextGradesList = splitCargoGrades(args.nextPayload.cargo_grade);
  const desiredHolds = nextHolds > 0 ? nextHolds : 1;
  const desiredGrades = nextGradesList.length ? nextGradesList : ["TOTAL"];

  const existingByKey = new Map(
    activeRows.map((row: any) => [`${Number(row.hold)}|${String(row.grade || "")}`, row]),
  );

  const deleteRes = await admin
    .from("stow_plans")
    .delete()
    .eq("vessel_id", args.linkedVesselId)
    .not("grade", "in", '("__META_DRAFT_FWD__","__META_DRAFT_MEAN__","__META_DRAFT_AFT__")');
  if (deleteRes.error) throw new Error(deleteRes.error.message);

  const rebuiltRows = Array.from({ length: desiredHolds }).flatMap((_, index) =>
    desiredGrades.map((grade) => {
      const existing = existingByKey.get(`${index + 1}|${grade}`);
      return {
        vessel_id: args.linkedVesselId,
        hold: index + 1,
        grade,
        total_mt: Number(existing?.total_mt || 0),
        condition: existing?.condition || null,
        draft_fwd: preservedDraftSource?.draft_fwd ?? null,
        draft_mean: preservedDraftSource?.draft_mean ?? null,
        draft_aft: preservedDraftSource?.draft_aft ?? null,
      };
    }),
  );

  if (!rebuiltRows.length) return;

  let insertStow = await admin.from("stow_plans").insert(rebuiltRows);
  if (insertStow.error && String(insertStow.error.message || "").toLowerCase().includes("condition")) {
    insertStow = await admin.from("stow_plans").insert(
      rebuiltRows.map((row) => ({
        vessel_id: row.vessel_id,
        hold: row.hold,
        grade: row.grade,
        total_mt: row.total_mt,
        draft_fwd: row.draft_fwd,
        draft_mean: row.draft_mean,
        draft_aft: row.draft_aft,
      })),
    );
  }
  if (insertStow.error) throw new Error(insertStow.error.message);
}

async function resolveOperatorInitials(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId?: string | null) {
  if (!userId) return null;
  const profile = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  if (profile.error) return null;
  return profile.data?.username?.trim() || null;
}

async function assertUniqueAppointmentKey(args: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  appointmentId: string;
  vesselName: string;
  port: string | null;
  nominationReceivedOn: string;
}) {
  const { supabase, appointmentId, vesselName, port, nominationReceivedOn } = args;
  const normalizedPort = (port || "").trim();
  const appointmentsResult = await supabase
    .from("appointments")
    .select("id")
    .ilike("vessel_name", vesselName.trim())
    .ilike("port", normalizedPort)
    .neq("id", appointmentId);

  if (appointmentsResult.error) throw new Error(appointmentsResult.error.message);
  const candidateIds = (appointmentsResult.data ?? []).map((row) => row.id as string);
  if (!candidateIds.length) return;

  const accountingResult = await supabase
    .from("appointment_accounting")
    .select("appointment_id")
    .eq("nomination_received_on", nominationReceivedOn)
    .in("appointment_id", candidateIds);

  if (accountingResult.error) {
    if (isMissingAccountingColumn(accountingResult.error.message)) return;
    throw new Error(accountingResult.error.message);
  }

  if ((accountingResult.data ?? []).length > 0) {
    throw new Error("An appointment with the same vessel, port and appointment date already exists.");
  }
}

async function fetchAccountingSeed(supabase: Awaited<ReturnType<typeof supabaseServer>>, appointmentId: string) {
  const result = await supabase
    .from("appointment_accounting")
    .select("appointment_id,accounting_reference,nomination_received_on,roe,pda_sent_on,pda_not_required,ada_created_on,ada_sent_on,fda_created_on,fda_sent_on")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (result.error) {
    if (isMissingAccountingColumn(result.error.message)) return null;
    throw new Error(result.error.message);
  }

  return result.data;
}

async function upsertAccountingSeed(args: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  appointmentId: string;
  accountingReference: string | null;
  nominationReceivedOn: string;
  operatorInitials: string | null;
  pdaSentOn: string | null;
  pdaNotRequired: boolean;
  adaCreatedOn: string | null;
  adaSentOn: string | null;
  fdaCreatedOn: string | null;
  fdaSentOn: string | null;
}) {
  const {
    supabase,
    appointmentId,
    accountingReference,
    nominationReceivedOn,
    operatorInitials,
    pdaSentOn,
    pdaNotRequired,
    adaCreatedOn,
    adaSentOn,
    fdaCreatedOn,
    fdaSentOn,
  } = args;
  const result = await supabase.from("appointment_accounting").upsert(
    {
      appointment_id: appointmentId,
      accounting_reference: accountingReference,
      nomination_received_on: nominationReceivedOn,
      pda_sent_on: pdaSentOn,
      pda_not_required: pdaNotRequired,
      ada_created_on: adaCreatedOn,
      ada_sent_on: adaSentOn,
      fda_created_on: fdaCreatedOn,
      fda_sent_on: fdaSentOn,
      operator_initials: operatorInitials,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "appointment_id" },
  );

  if (result.error && !isMissingAccountingColumn(result.error.message)) {
    throw new Error(result.error.message);
  }
}

async function persistSecondaryRecords(args: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  appointmentId: string;
  body: CreateAppointmentInput;
  operatorInitials: string | null;
  nominationReceivedOn: string;
  pdaSentOn: string | null;
  pdaNotRequired: boolean;
  adaCreatedOn: string | null;
  adaSentOn: string | null;
  fdaCreatedOn: string | null;
  fdaSentOn: string | null;
}) {
  const {
    supabase,
    appointmentId,
    body,
    operatorInitials,
    nominationReceivedOn,
    pdaSentOn,
    pdaNotRequired,
    adaCreatedOn,
    adaSentOn,
    fdaCreatedOn,
    fdaSentOn,
  } = args;

  const recipients = sanitizeRecipients(body.recipients);
  const deleteResult = await supabase.from("appointment_recipients").delete().eq("appointment_id", appointmentId);
  if (deleteResult.error && !deleteResult.error.message.includes("appointment_recipients")) {
    throw new Error(deleteResult.error.message);
  }

  if (recipients.length) {
    const insertRecipients = await supabase.from("appointment_recipients").insert(
      recipients.map((recipient) => ({
        appointment_id: appointmentId,
        ...recipient,
      })),
    );
    if (insertRecipients.error && !insertRecipients.error.message.includes("appointment_recipients")) {
      throw new Error(insertRecipients.error.message);
    }
  }

  await upsertAccountingSeed({
    supabase,
    appointmentId,
    accountingReference: body.accounting_reference?.trim() || null,
    nominationReceivedOn,
    operatorInitials,
    pdaSentOn,
    pdaNotRequired,
    adaCreatedOn,
    adaSentOn,
    fdaCreatedOn,
    fdaSentOn,
  });
  await saveEtaNotice(supabase, appointmentId, body.eta_notice);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: appointment, error: appointmentError }, timelineResult, recipientsResult, etaSettingsResult, etaLinesResult, accountingSeed] = await Promise.all([
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
      supabase
        .from("appointment_eta_notice_settings")
        .select("appointment_id,enabled,first_service_starts_at,last_service_ends_at")
        .eq("appointment_id", id)
        .maybeSingle(),
      supabase
        .from("appointment_eta_notice_lines")
        .select(
          "id,appointment_id,supplier_name,supplier_emails,service_name,in_mode,in_qty,out_mode,out_qty,trigger_eta_eosp,trigger_epob,trigger_etb,trigger_etd,trigger_eta_bunker,is_active",
        )
        .eq("appointment_id", id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      fetchAccountingSeed(supabase, id),
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

    const etaNotice = etaSettingsResult.error
      ? null
      : {
          ...(etaSettingsResult.data || {
            enabled: true,
            first_service_starts_at: null,
            last_service_ends_at: null,
          }),
          lines: etaLinesResult.error ? [] : (etaLinesResult.data ?? []),
        };

    return NextResponse.json({
      data: {
        appointment: {
          ...appointment,
          status: derivedStatus,
          accounting_reference: accountingSeed?.accounting_reference ?? null,
          nomination_received_on: accountingSeed?.nomination_received_on ?? null,
          roe: accountingSeed?.roe ?? null,
          pda_sent_on: accountingSeed?.pda_sent_on ?? null,
          pda_not_required: accountingSeed?.pda_not_required ?? false,
          ada_created_on: accountingSeed?.ada_created_on ?? null,
          ada_sent_on: accountingSeed?.ada_sent_on ?? null,
          fda_created_on: accountingSeed?.fda_created_on ?? null,
          fda_sent_on: accountingSeed?.fda_sent_on ?? null,
        },
        timeline: timelineRows,
        recipients,
        eta_notice: etaNotice,
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
    if (!body?.port?.trim()) {
      return NextResponse.json({ error: "port is required" }, { status: 400 });
    }

    const nominationReceivedOn = sanitizeDate(body.nomination_received_on);
    if (!nominationReceivedOn) {
      return NextResponse.json({ error: "nomination_received_on is required in YYYY-MM-DD format" }, { status: 400 });
    }
    const pdaSentOn = sanitizeDate(body.pda_sent_on);
    const pdaNotRequired = !!body.pda_not_required;
    const adaCreatedOn = sanitizeDate(body.ada_created_on);
    const adaSentOn = sanitizeDate(body.ada_sent_on);
    const fdaCreatedOn = sanitizeDate(body.fda_created_on);
    const fdaSentOn = sanitizeDate(body.fda_sent_on);

    const { supabase, user } = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await assertUniqueAppointmentKey({
      supabase,
      appointmentId: id,
      vesselName: body.vessel_name,
      port: body.port?.trim() || null,
      nominationReceivedOn,
    });
    const operatorInitials = await resolveOperatorInitials(supabase, user?.id);

    const currentAppointmentRes = await supabase
      .from("appointments")
      .select("id,vessel_name,port,terminal,cargo_operation,cargo_grade,holds,shiftreporter_link")
      .eq("id", id)
      .maybeSingle();
    if (currentAppointmentRes.error) {
      return NextResponse.json({ error: currentAppointmentRes.error.message }, { status: 500 });
    }
    if (!currentAppointmentRes.data) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    const currentAppointment = currentAppointmentRes.data;
    const preservedShiftLink = body.shiftreporter_link?.trim() || currentAppointment.shiftreporter_link || null;

    const payload = {
      vessel_name: body.vessel_name.trim(),
      role: body.role?.trim() || "AGENT",
      appointed_by: body.appointed_by?.trim() || "AGENT",
      port: body.port?.trim() || null,
      terminal: body.terminal?.trim() || null,
      cargo_operation: body.cargo_operation?.trim() || null,
      cargo_grade: body.cargo_grade?.trim() || null,
      cargo_qty: sanitizeInt(body.cargo_qty, 6),
      holds: currentAppointment.holds ?? null,
      appointment_datetime: body.appointment_datetime || `${nominationReceivedOn}T00:00:00.000Z`,
      charterer_agent: body.charterer_agent?.trim() || null,
      thanks_to: body.thanks_to?.trim() || null,
      shiftreporter_link: preservedShiftLink,
      other_agents: body.other_agents?.trim() || null,
      other_agents_role: body.other_agents_role?.trim() || null,
      sub_agent_id: body.sub_agent_id || null,
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
        { error: "An appointment with the same vessel, port and appointment date already exists." },
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
        sub_agent_id: payload.sub_agent_id,
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
        try {
          await persistSecondaryRecords({
            supabase,
            appointmentId: id,
            body,
            operatorInitials,
            nominationReceivedOn,
            pdaSentOn,
            pdaNotRequired,
            adaCreatedOn,
            adaSentOn,
            fdaCreatedOn,
            fdaSentOn,
          });
        } catch (error: unknown) {
          return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to save accounting fields or ETA notices" },
            { status: 500 },
          );
        }

        return NextResponse.json({
          data: {
            ...alertSafeUpdate.data,
            accounting_reference: body.accounting_reference?.trim() || null,
            nomination_received_on: nominationReceivedOn,
          },
        });
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
        sub_agent_id: payload.sub_agent_id,
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

      try {
        await persistSecondaryRecords({
          supabase,
          appointmentId: id,
          body,
          operatorInitials,
          nominationReceivedOn,
          pdaSentOn,
          pdaNotRequired,
          adaCreatedOn,
          adaSentOn,
          fdaCreatedOn,
          fdaSentOn,
        });
      } catch (error: unknown) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to save accounting fields or ETA notices" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        data: {
          ...fallbackUpdate.data,
          accounting_reference: body.accounting_reference?.trim() || null,
          nomination_received_on: nominationReceivedOn,
        },
      });
    }

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    try {
      await persistSecondaryRecords({
        supabase,
        appointmentId: id,
        body,
        operatorInitials,
        nominationReceivedOn,
        pdaSentOn,
        pdaNotRequired,
        adaCreatedOn,
        adaSentOn,
        fdaCreatedOn,
        fdaSentOn,
      });
    } catch (error: unknown) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to save accounting fields or ETA notices" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        ...updateResult.data,
        accounting_reference: body.accounting_reference?.trim() || null,
        nomination_received_on: nominationReceivedOn,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update appointment" },
      { status: 500 },
    );
  }
}
