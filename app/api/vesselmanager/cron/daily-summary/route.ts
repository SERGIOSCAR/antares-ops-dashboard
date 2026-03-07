import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabase/server";

type TimelineCode =
  | "ETA_OUTER_ROADS"
  | "EPOB"
  | "ETA_RIVER"
  | "ETB"
  | "COMMENCE_OPS"
  | "COMPLETE_OPS"
  | "ETD"
  | "ETA_BUNKER";

type AppointmentRow = {
  id: string;
  vessel_name: string;
  port: string | null;
  terminal: string | null;
};

type TimelineRow = {
  appointment_id: string;
  event_type: TimelineCode;
  eta: string | null;
  ata: string | null;
  event_date?: string | null;
  event_time_text?: string | null;
};

type TimelineMap = Record<string, Partial<Record<TimelineCode, TimelineRow>>>;

const DEFAULT_TO = "sergioaita21@gmail.com";
const TZ = "America/Buenos_Aires";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseEventDate(row?: TimelineRow | null) {
  if (!row) return null;
  if (row.event_date) {
    const d = new Date(`${row.event_date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (row.eta) {
    const d = new Date(row.eta);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (row.ata) {
    const d = new Date(row.ata);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateTimeCompact(row?: TimelineRow | null) {
  if (!row) return "-";
  if (row.event_date) {
    const d = new Date(`${row.event_date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return row.event_time_text || row.event_date;
    const day = pad2(d.getDate());
    const month = d.toLocaleString("en-US", { month: "short" });
    if (row.event_time_text) return `${day} ${month} ${row.event_time_text}`;
    return `${day} ${month}`;
  }

  const source = row.eta || row.ata;
  if (!source) return "-";
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return source;
  const day = pad2(d.getDate());
  const month = d.toLocaleString("en-US", { month: "short" });
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return mm === "00" ? `${day} ${month} ${hh}h` : `${day} ${month} ${hh}:${mm}`;
}

function hasAta(map: Partial<Record<TimelineCode, TimelineRow>>, code: TimelineCode) {
  return !!map[code]?.ata;
}

function deriveState(map: Partial<Record<TimelineCode, TimelineRow>>) {
  if (hasAta(map, "ETD")) return "SAILED";
  if (hasAta(map, "ETB")) return "OPERATING";
  if (hasAta(map, "EPOB")) return "IN_PORT";

  const eosp = map.ETA_OUTER_ROADS;
  const eospDate = parseEventDate(eosp);
  if (eospDate) {
    const now = new Date();
    if (eospDate.getTime() > now.getTime()) return "EN_ROUTE";
    return "AT_ROADS";
  }

  return "PROSPECT";
}

function eventLabel(code: TimelineCode) {
  if (code === "ETA_OUTER_ROADS") return "ETA EOSP";
  return code.replaceAll("_", " ");
}

function buildPlainText(args: {
  todayYmd: string;
  tomorrowYmd: string;
  appointments: AppointmentRow[];
  timelineByAppointment: TimelineMap;
}) {
  const { todayYmd, tomorrowYmd, appointments, timelineByAppointment } = args;
  const lines: string[] = [];

  lines.push(`Daily VesselManager Summary - ${todayYmd}`);
  lines.push("");
  lines.push(`Today's Prospects (sent at 00:05) - events expected on ${tomorrowYmd}`);

  const prospects: string[] = [];
  for (const appt of appointments) {
    const timeline = timelineByAppointment[appt.id] || {};
    const state = deriveState(timeline);
    if (state === "SAILED") continue;

    (Object.keys(timeline) as TimelineCode[]).forEach((code) => {
      const row = timeline[code];
      if (!row || !row.eta) return;
      const d = parseEventDate(row);
      if (!d) return;
      if (ymdInTz(d, TZ) !== tomorrowYmd) return;
      prospects.push(`${eventLabel(code)} | ${formatDateTimeCompact(row)} | ${appt.vessel_name} | ${appt.port || "-"}`);
    });
  }

  if (prospects.length === 0) {
    lines.push("- none");
  } else {
    prospects.sort((a, b) => a.localeCompare(b));
    prospects.forEach((p) => lines.push(`- ${p}`));
  }

  lines.push("");
  lines.push("Great Summary of Active Vessels");

  const operating: string[] = [];
  const inPort: string[] = [];
  for (const appt of appointments) {
    const timeline = timelineByAppointment[appt.id] || {};
    const state = deriveState(timeline);
    if (state === "OPERATING") {
      operating.push(
        `${appt.vessel_name} | COMP OPS: ${formatDateTimeCompact(timeline.COMPLETE_OPS)} | ETD: ${formatDateTimeCompact(timeline.ETD)} | ETA BUNKER: ${formatDateTimeCompact(timeline.ETA_BUNKER)}`,
      );
    }
    if (state === "IN_PORT") {
      inPort.push(
        `${appt.vessel_name} | EPOB: ${formatDateTimeCompact(timeline.EPOB)} | ETB: ${formatDateTimeCompact(timeline.ETB)} | Port: ${appt.port || "-"} ${appt.terminal ? `- ${appt.terminal}` : ""}`,
      );
    }
  }

  lines.push("");
  lines.push(`Vessels Operating (${operating.length})`);
  if (operating.length === 0) lines.push("- none");
  operating.forEach((x) => lines.push(`- ${x}`));

  lines.push("");
  lines.push(`Vessels in Port (${inPort.length})`);
  if (inPort.length === 0) lines.push("- none");
  inPort.forEach((x) => lines.push(`- ${x}`));

  lines.push("");
  lines.push("Generated automatically by antaresship.agency");

  return lines.join("\n");
}

async function sendDailySummary(to: string) {
  const supabase = await supabaseServer();

  const appointmentsRes = await supabase
    .from("appointments")
    .select("id,vessel_name,port,terminal,status")
    .order("created_at", { ascending: false });

  if (appointmentsRes.error) {
    throw new Error(appointmentsRes.error.message);
  }

  const appointments = (appointmentsRes.data || []) as AppointmentRow[];
  const appointmentIds = appointments.map((a) => a.id);

  const timelineByAppointment: TimelineMap = {};
  if (appointmentIds.length > 0) {
    let timelineRes = await supabase
      .from("appointment_timeline")
      .select("appointment_id,event_type,eta,ata,event_date,event_time_text")
      .in("appointment_id", appointmentIds);

    if (
      timelineRes.error &&
      (timelineRes.error.message.includes("event_date") || timelineRes.error.message.includes("event_time_text"))
    ) {
      timelineRes = await supabase
        .from("appointment_timeline")
        .select("appointment_id,event_type,eta,ata")
        .in("appointment_id", appointmentIds);
    }

    if (timelineRes.error) {
      throw new Error(timelineRes.error.message);
    }

    ((timelineRes.data || []) as TimelineRow[]).forEach((row) => {
      if (!timelineByAppointment[row.appointment_id]) timelineByAppointment[row.appointment_id] = {};
      timelineByAppointment[row.appointment_id][row.event_type] = row;
    });
  }

  const now = new Date();
  const todayYmd = ymdInTz(now, TZ);
  const tomorrowYmd = ymdInTz(addDays(now, 1), TZ);
  const subject = `Today's Prospects - ${todayYmd}`;
  const text = buildPlainText({
    todayYmd,
    tomorrowYmd,
    appointments,
    timelineByAppointment,
  });

  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!process.env.EMAIL_FROM?.trim()) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const emailResult = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
  });

  if (emailResult.error) {
    throw new Error(emailResult.error.message);
  }

  return {
    to,
    subject,
    emailId: emailResult.data?.id || null,
    todayYmd,
    tomorrowYmd,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const to = body.to?.trim() || DEFAULT_TO;
    const data = await sendDailySummary(to);
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send daily summary" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const data = await sendDailySummary(DEFAULT_TO);
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send daily summary" },
      { status: 500 },
    );
  }
}
