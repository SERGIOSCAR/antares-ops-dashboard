import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";

type TimelineCode = "ETA_OUTER_ROADS" | "EPOB" | "ETB" | "ETD" | "ETA_BUNKER";

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

type NoticeSetting = {
  appointment_id: string;
  enabled: boolean;
  first_service_starts_at: string | null;
  last_service_ends_at: string | null;
};

type NoticeLine = {
  appointment_id: string;
  supplier_name: string;
  supplier_emails: string;
  service_name: string;
  in_mode: "none" | "yes" | "qty";
  in_qty: number | null;
  out_mode: "none" | "yes" | "qty";
  out_qty: number | null;
  trigger_eta_eosp: boolean;
  trigger_epob: boolean;
  trigger_etb: boolean;
  trigger_etd: boolean;
  trigger_eta_bunker: boolean;
  is_active: boolean;
};

const TZ = "America/Buenos_Aires";
const DEFAULT_FROM = "Vesselmanager <summary@report.antaresship.agency>";

function isAuthorizedCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

function resolveFromAddress() {
  return process.env.VESSELMANAGER_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

function normalizeEmails(input: string) {
  return Array.from(
    new Set(
      String(input || "")
        .split(/[;,]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
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

function hourInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

function slotByHour(hour: number): "1000" | "2200" {
  return hour >= 16 ? "2200" : "1000";
}

function formatEventDate(row?: TimelineRow | null) {
  if (!row) return "-";
  if (row.event_date) {
    const d = new Date(`${row.event_date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return row.event_date;
    return d.toLocaleDateString("en-GB", { month: "short", day: "2-digit" });
  }
  const source = row.eta || row.ata;
  if (!source) return "-";
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return source;
  return d.toLocaleString("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function humanInOut(mode: "none" | "yes" | "qty", qty: number | null, side: "IN" | "OUT") {
  if (mode === "none") return `${side}: NO`;
  if (mode === "yes") return `${side}: YES`;
  return `${side}: QTY ${Number(qty || 0)}`;
}

function eventTitle(code: TimelineCode) {
  if (code === "ETA_OUTER_ROADS") return "ETA EOSP";
  if (code === "ETA_BUNKER") return "ETA BUNKER";
  return code;
}

function toEventCodes(line: NoticeLine) {
  const rows: TimelineCode[] = [];
  if (line.trigger_eta_eosp) rows.push("ETA_OUTER_ROADS");
  if (line.trigger_epob) rows.push("EPOB");
  if (line.trigger_etb) rows.push("ETB");
  if (line.trigger_etd) rows.push("ETD");
  if (line.trigger_eta_bunker) rows.push("ETA_BUNKER");
  return rows;
}

function subjectDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(date);
}

function buildEmail(args: {
  appointment: AppointmentRow;
  setting: NoticeSetting | undefined;
  supplierName: string;
  rows: Array<{
    serviceName: string;
    inText: string;
    outText: string;
    pendingEvents: Array<{ code: TimelineCode; value: string }>;
  }>;
}) {
  const { appointment, setting, supplierName, rows } = args;
  const title = `Daily ETA Notices - ${appointment.vessel_name} - ${supplierName}`;
  const windowLine = `1st service starts: ${setting?.first_service_starts_at || "-"} | last service ends: ${setting?.last_service_ends_at || "-"}`;

  const textLines = [
    title,
    `${appointment.vessel_name} | ${appointment.port || "-"} | ${appointment.terminal || "-"}`,
    windowLine,
    "",
  ];

  rows.forEach((row) => {
    textLines.push(`${row.serviceName}`);
    textLines.push(`  ${row.inText} | ${row.outText}`);
    row.pendingEvents.forEach((event) => {
      textLines.push(`  - ${eventTitle(event.code)}: ${event.value}`);
    });
    textLines.push("");
  });

  textLines.push("Automatically generated by antaresship.agency.");
  const text = textLines.join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef3ef;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:760px;margin:20px auto;background:#ffffff;border:1px solid #d5e4d8;border-radius:10px;overflow:hidden;">
      <div style="padding:16px 20px;background:#1f3d2f;color:#ffffff;">
        <div style="font-size:22px;font-weight:700;line-height:1.2;">${title}</div>
      </div>
      <div style="padding:16px 20px;">
        <div style="font-size:14px;margin-bottom:4px;"><strong>${appointment.vessel_name}</strong> | ${appointment.port || "-"} | ${appointment.terminal || "-"}</div>
        <div style="font-size:12px;color:#475569;margin-bottom:12px;">${windowLine}</div>
        ${rows
          .map(
            (row) => `
          <div style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;overflow:hidden;">
            <div style="background:#0f274a;color:#fff;padding:8px 10px;font-size:13px;font-weight:700;">${row.serviceName}</div>
            <div style="padding:10px;font-size:12px;">
              <div style="margin-bottom:6px;">${row.inText} | ${row.outText}</div>
              <ul style="margin:0 0 0 18px;padding:0;">
                ${row.pendingEvents.map((event) => `<li>${eventTitle(event.code)}: ${event.value}</li>`).join("")}
              </ul>
            </div>
          </div>`,
          )
          .join("")}
        <div style="margin-top:12px;font-size:11px;color:#64748b;">Automatically generated by antaresship.agency.</div>
      </div>
    </div>
  </body>
</html>`;

  return { text, html };
}

async function runCron(slotOverride?: "1000" | "2200") {
  const admin = supabaseAdmin();
  const now = new Date();
  const localHour = hourInTz(now, TZ);
  const slot = slotOverride || slotByHour(localHour);
  const runDateLocal = ymdInTz(now, TZ);

  const [settingsRes, linesRes] = await Promise.all([
    admin
      .from("appointment_eta_notice_settings")
      .select("appointment_id,enabled,first_service_starts_at,last_service_ends_at")
      .eq("enabled", true),
    admin
      .from("appointment_eta_notice_lines")
      .select(
        "appointment_id,supplier_name,supplier_emails,service_name,in_mode,in_qty,out_mode,out_qty,trigger_eta_eosp,trigger_epob,trigger_etb,trigger_etd,trigger_eta_bunker,is_active",
      )
      .eq("is_active", true),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (linesRes.error) throw new Error(linesRes.error.message);

  const settings = (settingsRes.data || []) as NoticeSetting[];
  const lines = (linesRes.data || []) as NoticeLine[];
  const enabledAppointments = new Set(settings.map((s) => s.appointment_id));
  const activeLines = lines.filter((line) => enabledAppointments.has(line.appointment_id));
  if (!activeLines.length) {
    return { slot, runDateLocal, sent: 0, skipped: 0, reason: "No active notice lines" };
  }

  const appointmentIds = Array.from(new Set(activeLines.map((x) => x.appointment_id)));
  const [appointmentsRes, timelineRes, sentLogRes] = await Promise.all([
    admin
      .from("appointments")
      .select("id,vessel_name,port,terminal")
      .in("id", appointmentIds),
    admin
      .from("appointment_timeline")
      .select("appointment_id,event_type,eta,ata,event_date,event_time_text")
      .in("appointment_id", appointmentIds)
      .in("event_type", ["ETA_OUTER_ROADS", "EPOB", "ETB", "ETD", "ETA_BUNKER"]),
    admin
      .from("appointment_eta_notice_dispatch_log")
      .select("appointment_id,supplier_name")
      .eq("run_date_local", runDateLocal)
      .eq("slot_local", slot),
  ]);
  if (appointmentsRes.error) throw new Error(appointmentsRes.error.message);
  if (timelineRes.error) throw new Error(timelineRes.error.message);
  if (sentLogRes.error) throw new Error(sentLogRes.error.message);

  const appointments = (appointmentsRes.data || []) as AppointmentRow[];
  const appointmentById = new Map(appointments.map((a) => [a.id, a]));
  const settingByAppointment = new Map(settings.map((s) => [s.appointment_id, s]));

  const timelineByAppointment = new Map<string, Partial<Record<TimelineCode, TimelineRow>>>();
  ((timelineRes.data || []) as TimelineRow[]).forEach((row) => {
    const key = row.appointment_id;
    const bucket = timelineByAppointment.get(key) || {};
    bucket[row.event_type] = row;
    timelineByAppointment.set(key, bucket);
  });

  const alreadySent = new Set(
    ((sentLogRes.data || []) as Array<{ appointment_id: string; supplier_name: string }>).map(
      (row) => `${row.appointment_id}|${row.supplier_name.toLowerCase()}`,
    ),
  );

  const groups = new Map<string, NoticeLine[]>();
  activeLines.forEach((line) => {
    const key = `${line.appointment_id}|${line.supplier_name.toLowerCase()}`;
    const arr = groups.get(key) || [];
    arr.push(line);
    groups.set(key, arr);
  });

  if (!process.env.RESEND_API_KEY?.trim()) throw new Error("RESEND_API_KEY is not configured");
  const fromAddress = resolveFromAddress();
  if (!fromAddress) throw new Error("EMAIL_FROM (or VESSELMANAGER_EMAIL_FROM) is not configured");
  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let skipped = 0;

  for (const [groupKey, groupLines] of groups.entries()) {
    const [appointmentId] = groupKey.split("|");
    const base = groupLines[0];
    const supplierName = base.supplier_name;
    const sentKey = `${appointmentId}|${supplierName.toLowerCase()}`;
    if (alreadySent.has(sentKey)) {
      skipped += 1;
      continue;
    }

    const appointment = appointmentById.get(appointmentId);
    if (!appointment) {
      skipped += 1;
      continue;
    }
    const timelineMap = timelineByAppointment.get(appointmentId) || {};

    const renderedRows = groupLines
      .map((line) => {
        const pendingEvents = toEventCodes(line)
          .filter((code) => !timelineMap[code]?.ata)
          .map((code) => ({ code, value: formatEventDate(timelineMap[code]) }));

        if (!pendingEvents.length) return null;
        return {
          serviceName: line.service_name,
          inText: humanInOut(line.in_mode, line.in_qty, "IN"),
          outText: humanInOut(line.out_mode, line.out_qty, "OUT"),
          pendingEvents,
        };
      })
      .filter(Boolean) as Array<{
      serviceName: string;
      inText: string;
      outText: string;
      pendingEvents: Array<{ code: TimelineCode; value: string }>;
    }>;

    if (!renderedRows.length) {
      skipped += 1;
      continue;
    }

    const to = normalizeEmails(base.supplier_emails);
    if (!to.length) {
      skipped += 1;
      continue;
    }

    const { text, html } = buildEmail({
      appointment,
      setting: settingByAppointment.get(appointmentId),
      supplierName,
      rows: renderedRows,
    });
    const subject = `Daily ETA Notices ${subjectDate(now)} - ${slot} hrs - ${appointment.vessel_name} - ${supplierName}`;

    const emailResult = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });
    if (emailResult.error) throw new Error(emailResult.error.message);

    const logRes = await admin.from("appointment_eta_notice_dispatch_log").insert({
      run_date_local: runDateLocal,
      slot_local: slot,
      appointment_id: appointmentId,
      supplier_name: supplierName,
      email_to: to.join(","),
      subject,
      email_id: emailResult.data?.id || null,
      status: "sent",
    });
    if (logRes.error) throw new Error(logRes.error.message);
    sent += 1;
  }

  return { slot, runDateLocal, sent, skipped };
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { slot?: "1000" | "2200" };
    const data = await runCron(body.slot);
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send daily ETA notices" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await runCron();
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send daily ETA notices" },
      { status: 500 },
    );
  }
}

