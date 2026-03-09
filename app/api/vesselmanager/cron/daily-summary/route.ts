import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
type SendSummaryOptions = {
  onlyFollowed?: boolean;
  followedIds?: string[];
  reportHourLabel?: string;
};

const DEFAULT_TO = "sergioaita21@gmail.com";
const TZ = "America/Buenos_Aires";
const DEFAULT_FROM = "Vesselmanager <summary@report.antaresship.agency>";

function resolveRecipient(requested?: string) {
  const forced = process.env.VESSELMANAGER_FORCE_TO?.trim();
  if (forced) return forced;
  return requested?.trim() || DEFAULT_TO;
}

function resolveFromAddress() {
  return process.env.VESSELMANAGER_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

function isAuthorizedCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

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

function formatSubjectDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(date);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
  }).format(date);
}

function formatTimeOrPeriod(row?: TimelineRow | null) {
  if (!row) return "-";
  if (row.event_time_text?.trim()) return row.event_time_text.trim();

  const source = row.eta || row.ata;
  if (!source) return "-";
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return source;

  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return mm === "00" ? `${hh}h` : `${hh}:${mm}`;
}

function hasAta(map: Partial<Record<TimelineCode, TimelineRow>>, code: TimelineCode) {
  return !!map[code]?.ata;
}

function deriveState(map: Partial<Record<TimelineCode, TimelineRow>>) {
  if (hasAta(map, "ETD")) return "SAILED";
  if (hasAta(map, "ETB")) return "ALONGSIDE";
  if (hasAta(map, "ETA_RIVER")) return "IN PORT";
  if (hasAta(map, "EPOB")) return "ANCHORED OUTER ROADS";

  const eosp = map.ETA_OUTER_ROADS;
  const eospDate = parseEventDate(eosp);
  if (eospDate) {
    const now = new Date();
    if (eospDate.getTime() > now.getTime()) return "EN ROUTE";
    return "ANCHORED OUTER ROADS";
  }

  return "EN ROUTE";
}

function eventLabel(code: TimelineCode) {
  if (code === "ETA_OUTER_ROADS") return "ETA EOSP";
  return code.replaceAll("_", " ");
}

function buildPlainText(args: {
  today: Date;
  todayYmd: string;
  tomorrowYmd: string;
  appointments: AppointmentRow[];
  timelineByAppointment: TimelineMap;
}) {
  const { today, todayYmd, tomorrowYmd, appointments, timelineByAppointment } = args;
  const lines: string[] = [];

  lines.push("Daily Vessel Manager Summary");
  lines.push("");
  lines.push("NEXT EVENTS (24 & 48hs)");
  lines.push("=======================");

  const day1 = today;
  const day2 = addDays(today, 1);
  const day1Rows: string[] = [];
  const day2Rows: string[] = [];
  for (const appt of appointments) {
    const timeline = timelineByAppointment[appt.id] || {};
    const state = deriveState(timeline);
    if (state === "SAILED") continue;

    (Object.keys(timeline) as TimelineCode[]).forEach((code) => {
      const row = timeline[code];
      if (!row || !row.eta) return;
      const d = parseEventDate(row);
      if (!d) return;
      const ymd = ymdInTz(d, TZ);
      const portOnly = appt.port || "-";
      const line = `${formatTimeOrPeriod(row)} ${eventLabel(code)} | ${appt.vessel_name} | ${portOnly}`;
      if (ymd === todayYmd) day1Rows.push(line);
      if (ymd === tomorrowYmd) day2Rows.push(line);
    });
  }

  lines.push(`=> ${formatWeekday(day1)}`);
  if (day1Rows.length === 0) {
    lines.push("- none");
  } else {
    day1Rows.sort((a, b) => a.localeCompare(b));
    day1Rows.forEach((p) => lines.push(`- ${p}`));
  }

  lines.push("");
  lines.push(`=> ${formatWeekday(day2)}`);
  if (day2Rows.length === 0) {
    lines.push("- none");
  } else {
    day2Rows.sort((a, b) => a.localeCompare(b));
    day2Rows.forEach((p) => lines.push(`- ${p}`));
  }

  lines.push("");
  const activeCount = appointments.filter((appt) => deriveState(timelineByAppointment[appt.id] || {}) !== "SAILED").length;
  lines.push(`SUMMARY ALL ACTIVE VESSELS (${activeCount})`);
  lines.push("==========================");

  const operating: string[] = [];
  const inPort: string[] = [];
  const pendingChecklist: string[] = [];
  for (const appt of appointments) {
    const timeline = timelineByAppointment[appt.id] || {};
    const state = deriveState(timeline);
    const location = [appt.port || "-", appt.terminal || "-"].join(" - ");
    if (state === "ALONGSIDE") {
      operating.push(
        `${appt.vessel_name} | ${location} | ETB: ${formatDateTimeCompact(timeline.ETB)} | ETD: ${formatDateTimeCompact(timeline.ETD)}`,
      );
    }
    if (state === "IN PORT" || state === "ANCHORED OUTER ROADS") {
      inPort.push(
        `${appt.vessel_name} | ${location} | EPOB: ${formatDateTimeCompact(timeline.EPOB)} | ETB: ${formatDateTimeCompact(timeline.ETB)}`,
      );
    }
    const sailedConfirmed = hasAta(timeline, "ETD");
    const checklistDone = hasAta(timeline, "COMPLETE_OPS");
    if (sailedConfirmed && !checklistDone) {
      pendingChecklist.push(
        `${appt.vessel_name} | ETD: ${formatDateTimeCompact(timeline.ETD)} | PENDING SERVICE CHECKLIST`,
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
  lines.push(`PENDING SERVICE CHECKLIST (${pendingChecklist.length})`);
  if (pendingChecklist.length === 0) lines.push("- none");
  pendingChecklist.forEach((x) => lines.push(`- ${x}`));

  lines.push("");
  lines.push("Automatically Generated by antaresship.agency.");

  return lines.join("\n");
}

function buildHtml(args: {
  today: Date;
  todayYmd: string;
  tomorrowYmd: string;
  appointments: AppointmentRow[];
  timelineByAppointment: TimelineMap;
}) {
  const { today, todayYmd, tomorrowYmd, appointments, timelineByAppointment } = args;
  const day1 = today;
  const day2 = addDays(today, 1);
  const day1Rows: string[] = [];
  const day2Rows: string[] = [];
  const operating: string[] = [];
  const inPort: string[] = [];
  const pendingChecklist: string[] = [];
  let activeCount = 0;

  for (const appt of appointments) {
    const timeline = timelineByAppointment[appt.id] || {};
    const state = deriveState(timeline);
    if (state !== "SAILED") activeCount += 1;
    if (state !== "SAILED") {
      (Object.keys(timeline) as TimelineCode[]).forEach((code) => {
        const row = timeline[code];
        if (!row || !row.eta) return;
        const d = parseEventDate(row);
        if (!d) return;
        const ymd = ymdInTz(d, TZ);
        const portOnly = appt.port || "-";
        const line = `${formatTimeOrPeriod(row)} ${eventLabel(code)} | ${appt.vessel_name} | ${portOnly}`;
        if (ymd === todayYmd) day1Rows.push(line);
        if (ymd === tomorrowYmd) day2Rows.push(line);
      });
    }

    const location = [appt.port || "-", appt.terminal || "-"].join(" - ");
    if (state === "ALONGSIDE") {
      operating.push(`${appt.vessel_name} | ${location} | ETB: ${formatDateTimeCompact(timeline.ETB)} | ETD: ${formatDateTimeCompact(timeline.ETD)}`);
    }
    if (state === "IN PORT" || state === "ANCHORED OUTER ROADS") {
      inPort.push(`${appt.vessel_name} | ${location} | EPOB: ${formatDateTimeCompact(timeline.EPOB)} | ETB: ${formatDateTimeCompact(timeline.ETB)}`);
    }
    const sailedConfirmed = hasAta(timeline, "ETD");
    const checklistDone = hasAta(timeline, "COMPLETE_OPS");
    if (sailedConfirmed && !checklistDone) {
      pendingChecklist.push(`${appt.vessel_name} | ETD: ${formatDateTimeCompact(timeline.ETD)} | PENDING SERVICE CHECKLIST`);
    }
  }

  day1Rows.sort((a, b) => a.localeCompare(b));
  day2Rows.sort((a, b) => a.localeCompare(b));

  const renderList = (items: string[]) => {
    if (items.length === 0) return "<li>none</li>";
    return items.map((x) => `<li>${x}</li>`).join("");
  };

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef3ef;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:760px;margin:20px auto;background:#ffffff;border:1px solid #d5e4d8;border-radius:10px;overflow:hidden;">
      <div style="padding:16px 20px;background:#1f3d2f;color:#ffffff;">
        <div style="font-size:26px;font-weight:700;line-height:1.2;">Daily Vessel Manager Summary</div>
      </div>
      <div style="padding:18px 20px;">
        <div style="font-size:16px;font-weight:700;background:#2f6b4f;color:#ffffff;padding:8px 12px;border-radius:6px;">NEXT EVENTS (24 &amp; 48hs)</div>
        <hr style="border:none;border-top:1px solid #d5e4d8;margin:10px 0 12px;" />
        <div style="font-weight:700;margin:0 0 8px;">=&gt; ${formatWeekday(day1)}</div>
        <ul style="margin:0 0 14px 18px;padding:0;line-height:1.55;">${renderList(day1Rows)}</ul>
        <div style="font-weight:700;margin:0 0 8px;">=&gt; ${formatWeekday(day2)}</div>
        <ul style="margin:0 0 14px 18px;padding:0;line-height:1.55;">${renderList(day2Rows)}</ul>

        <div style="font-size:16px;font-weight:700;margin-top:6px;background:#2f6b4f;color:#ffffff;padding:8px 12px;border-radius:6px;">SUMMARY ALL ACTIVE VESSELS (${activeCount})</div>
        <hr style="border:none;border-top:1px solid #d5e4d8;margin:10px 0 12px;" />
        <div style="font-weight:700;">Vessels Operating (${operating.length})</div>
        <ul style="margin:8px 0 14px 18px;padding:0;line-height:1.55;">${renderList(operating)}</ul>
        <div style="font-weight:700;">Vessels in Port (${inPort.length})</div>
        <ul style="margin:8px 0 14px 18px;padding:0;line-height:1.55;">${renderList(inPort)}</ul>
        <div style="font-weight:700;">PENDING SERVICE CHECKLIST (${pendingChecklist.length})</div>
        <ul style="margin:8px 0 14px 18px;padding:0;line-height:1.55;">${renderList(pendingChecklist)}</ul>

        <div style="margin-top:16px;font-size:12px;color:#64748b;">
          Automatically Generated by antaresship.agency.
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function sendDailySummary(to: string, options?: SendSummaryOptions) {
  const supabase = supabaseAdmin();

  const appointmentsRes = await supabase
    .from("appointments")
    .select("id,vessel_name,port,terminal,status")
    .order("created_at", { ascending: false });

  if (appointmentsRes.error) {
    throw new Error(appointmentsRes.error.message);
  }

  let appointments = (appointmentsRes.data || []) as AppointmentRow[];
  if (options?.onlyFollowed) {
    const allowed = new Set((options.followedIds || []).filter(Boolean));
    appointments = appointments.filter((item) => allowed.has(item.id));
  }
  const appointmentIds = appointments.map((a) => a.id);

  const timelineByAppointment: TimelineMap = {};
  if (appointmentIds.length > 0) {
    const timelineResWithExtendedCols = await supabase
      .from("appointment_timeline")
      .select("appointment_id,event_type,eta,ata,event_date,event_time_text")
      .in("appointment_id", appointmentIds);

    const needsFallback =
      timelineResWithExtendedCols.error &&
      (timelineResWithExtendedCols.error.message.includes("event_date") ||
        timelineResWithExtendedCols.error.message.includes("event_time_text"));

    const timelineRes = needsFallback
      ? await supabase
          .from("appointment_timeline")
          .select("appointment_id,event_type,eta,ata")
          .in("appointment_id", appointmentIds)
      : timelineResWithExtendedCols;

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
  const hourLabel = options?.reportHourLabel?.trim() || "05:00";
  const subject = options?.onlyFollowed
    ? `Antares Vessel-Manager Followed Vessels Summary ${formatSubjectDate(now)} - ${hourLabel} hrs`
    : `Antares Vessel-Manager Report Summary ${formatSubjectDate(now)} - ${hourLabel} hrs`;
  const templateArgs = {
    today: now,
    todayYmd,
    tomorrowYmd,
    appointments,
    timelineByAppointment,
  };
  const text = buildPlainText(templateArgs);
  const html = buildHtml(templateArgs);

  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const fromAddress = resolveFromAddress();
  if (!fromAddress) {
    throw new Error("EMAIL_FROM (or VESSELMANAGER_EMAIL_FROM) is not configured");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const emailResult = await resend.emails.send({
    from: fromAddress,
    to,
    subject,
    text,
    html,
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
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      to?: string;
      only_followed?: boolean;
      followed_ids?: string[];
      report_hour?: string;
    };
    const to = resolveRecipient(body.to);
    const data = await sendDailySummary(to, {
      onlyFollowed: !!body.only_followed,
      followedIds: Array.isArray(body.followed_ids) ? body.followed_ids.map((x) => String(x)) : [],
      reportHourLabel: body.report_hour || "05:00",
    });
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send daily summary" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await sendDailySummary(resolveRecipient());
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send daily summary" },
      { status: 500 },
    );
  }
}
