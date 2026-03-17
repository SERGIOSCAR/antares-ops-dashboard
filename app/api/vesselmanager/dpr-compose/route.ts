import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/lib/supabase/require-user";

type DprPayload = {
  openingSentence?: string;
  prospects?: string;
  lineUp?: string;
  shiftReport?: string;
  stowplan?: string;
  runningSof?: string;
  note?: string;
  // Backward compatibility with older drafts
  estimates?: string;
  fieldC?: string;
  notes?: string;
};

type DprOutput = "mailto" | "eml";

type DprBatch =
  | "cgnees_shippers_terminal"
  | "charterers_agent"
  | "principal_dpr"
  | "dpr_for_1"
  | "dpr_for_2"
  | "dpr_for_3"
  | "all";

type DprRecipientGroups = {
  cgnees_shippers_terminal?: string | string[];
  charterers_agent?: string | string[];
  principal_dpr?: string | string[];
  dpr_for_1?: string | string[];
  dpr_for_2?: string | string[];
  dpr_for_3?: string | string[];
};

function todayLabel() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dd} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function normalizeEmails(items: string[]) {
  const uniq = new Set<string>();
  items.forEach((item) => {
    const email = String(item || "").trim().toLowerCase();
    if (email) uniq.add(email);
  });
  return Array.from(uniq);
}

function parseEmails(input: unknown) {
  if (Array.isArray(input)) {
    return normalizeEmails(input.map((item) => String(item || "")));
  }
  const text = String(input || "");
  if (!text.trim()) return [] as string[];
  return normalizeEmails(text.split(/[,\s;]+/));
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sectionHtml(title: string, value: string) {
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="section-body">${escapeHtml(value || "-").replace(/\n/g, "<br/>")}</div>
    </div>
  `;
}

function buildDprHtml(args: {
  vesselName: string;
  port: string;
  terminal: string;
  openingSentence: string;
  prospects: string;
  lineUp: string;
  shiftReport: string;
  stowplan: string;
  runningSof: string;
  note: string;
}) {
  const sections: string[] = [];
  if (args.prospects) sections.push(sectionHtml("Prospects:", args.prospects));
  if (args.lineUp) sections.push(sectionHtml("Line Up", args.lineUp));
  if (args.shiftReport) sections.push(sectionHtml("Shift report", args.shiftReport));
  if (args.stowplan) sections.push(sectionHtml("Stowplan (with draft)", args.stowplan));
  if (args.runningSof) sections.push(sectionHtml("Running SOF", args.runningSof));
  if (args.note) sections.push(sectionHtml("NOTE", args.note));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin: 0; padding: 0; background: #f2f4f7; color: #0f172a; }
    .wrap { max-width: 900px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a1a1a; color: #ffffff; padding: 18px 22px; }
    .header h1 { margin: 0; font: 700 22px Arial, sans-serif; }
    .header p { margin: 6px 0 0; font: 400 13px Arial, sans-serif; color: #d8dee9; }
    .content { padding: 18px 22px; }
    .section { margin: 0 0 14px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .opening { margin: 0 0 14px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; font: 11px "Courier New", Courier, monospace; line-height: 1.5; }
    .section-title { background: #0f274a; color: #ffffff; padding: 8px 10px; font: 700 13px Arial, sans-serif; }
    .section-body { padding: 10px; font: 11px "Courier New", Courier, monospace; white-space: normal; line-height: 1.5; }
    .footer { padding: 8px 22px 18px; color: #64748b; font: 12px Arial, sans-serif; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Daily Prospect Report - ${escapeHtml(args.vesselName)}</h1>
      <p>${escapeHtml(args.port || "-")} / ${escapeHtml(args.terminal || "-")}</p>
    </div>
    <div class="content">
      ${args.openingSentence ? `<div class="opening">${escapeHtml(args.openingSentence).replace(/\n/g, "<br/>")}</div>` : ""}
      ${sections.join("\n")}
    </div>
    <div class="footer">
      Draft prepared from Antares Vessel Manager.
    </div>
  </div>
</body>
</html>
`.trim();
}

function toRfc822Date(date: Date) {
  return date.toUTCString().replace("GMT", "+0000");
}

function sanitizeFileName(input: string) {
  return input.replace(/[^\w.-]+/g, "_").slice(0, 80) || "dpr";
}

function buildEml(args: {
  to: string[];
  subject: string;
  plainText: string;
  html: string;
}) {
  const boundary = `----=_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const lines = [
    `To: ${args.to.join(", ")}`,
    `Subject: ${args.subject}`,
    `Date: ${toRfc822Date(new Date())}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    args.plainText,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    args.html,
    ``,
    `--${boundary}--`,
    ``,
  ];
  return lines.join("\r\n");
}

function normalizeBatchKey(input: string): DprBatch {
  const value = String(input || "").trim();
  if (value === "cgnees_shippers_terminal") return "cgnees_shippers_terminal";
  if (value === "charterers_agent") return "charterers_agent";
  if (value === "principal_dpr") return "principal_dpr";
  if (value === "dpr_for_1") return "dpr_for_1";
  if (value === "dpr_for_2") return "dpr_for_2";
  if (value === "dpr_for_3") return "dpr_for_3";
  if (value === "all") return "all";

  // Backward compatibility for previously stored draft batch values.
  if (value === "principal") return "principal_dpr";
  if (value === "batch_a") return "cgnees_shippers_terminal";
  if (value === "batch_b") return "charterers_agent";
  if (value === "batch_c") return "dpr_for_1";
  if (value === "batch_d") return "dpr_for_2";
  return "principal_dpr";
}

function categoryBatchKey(category: string): DprBatch {
  if (category === "cgnees_shippers_terminal") return "cgnees_shippers_terminal";
  if (category === "charterers_agent") return "charterers_agent";
  if (category === "principal_dpr") return "principal_dpr";
  if (category === "dpr_for_1") return "dpr_for_1";
  if (category === "dpr_for_2") return "dpr_for_2";
  if (category === "dpr_for_3") return "dpr_for_3";
  if (category === "service_provider") return "cgnees_shippers_terminal";
  if (category === "chart_agent_terminal_impoexpo_other") return "charterers_agent";
  if (category === "charterer") return "dpr_for_1";
  if (category === "principal") return "principal_dpr";
  if (category === "additional_party") return "dpr_for_3";
  return "dpr_for_3";
}

export async function POST(req: Request) {
  try {
    const { user } = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      appointment_id?: string;
      batch?: string;
      output?: DprOutput;
      recipient_groups?: DprRecipientGroups;
      dpr?: DprPayload;
    };

    const appointmentId = String(body?.appointment_id || "").trim();
    const batch = normalizeBatchKey(String(body?.batch || "principal_dpr"));
    const output: DprOutput = body?.output === "eml" ? "eml" : "mailto";
    if (!appointmentId) return NextResponse.json({ error: "appointment_id is required" }, { status: 400 });

    const admin = supabaseAdmin();
    const [{ data: appointment, error: appointmentError }, { data: recipientRows, error: recipientsError }] = await Promise.all([
      admin.from("appointments").select("id,vessel_name,port,terminal").eq("id", appointmentId).maybeSingle(),
      admin.from("appointment_recipients").select("category,email").eq("appointment_id", appointmentId),
    ]);
    if (appointmentError) return NextResponse.json({ error: appointmentError.message }, { status: 500 });
    if (recipientsError) return NextResponse.json({ error: recipientsError.message }, { status: 500 });
    if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

    const groupsFromBody: Record<Exclude<DprBatch, "all">, string[]> = {
      cgnees_shippers_terminal: parseEmails(body?.recipient_groups?.cgnees_shippers_terminal),
      charterers_agent: parseEmails(body?.recipient_groups?.charterers_agent),
      principal_dpr: parseEmails(body?.recipient_groups?.principal_dpr),
      dpr_for_1: parseEmails(body?.recipient_groups?.dpr_for_1),
      dpr_for_2: parseEmails(body?.recipient_groups?.dpr_for_2),
      dpr_for_3: parseEmails(body?.recipient_groups?.dpr_for_3),
    };
    const hasBodyGroups = Object.values(groupsFromBody).some((items) => items.length > 0);

    if (hasBodyGroups) {
      const managedCategories = [
        "cgnees_shippers_terminal",
        "charterers_agent",
        "principal_dpr",
        "dpr_for_1",
        "dpr_for_2",
        "dpr_for_3",
      ];
      const deleteResult = await admin
        .from("appointment_recipients")
        .delete()
        .eq("appointment_id", appointmentId)
        .in("category", managedCategories);
      if (deleteResult.error) {
        return NextResponse.json({ error: deleteResult.error.message }, { status: 500 });
      }

      const insertRows = managedCategories.flatMap((category) =>
        groupsFromBody[category as Exclude<DprBatch, "all">].map((email) => ({
          appointment_id: appointmentId,
          category,
          name: null,
          email,
          is_onetimer: false,
        })),
      );
      if (insertRows.length) {
        const insertResult = await admin.from("appointment_recipients").insert(insertRows);
        if (insertResult.error) {
          return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
        }
      }
    }

    const grouped: Record<DprBatch, string[]> = {
      cgnees_shippers_terminal: [],
      charterers_agent: [],
      principal_dpr: [],
      dpr_for_1: [],
      dpr_for_2: [],
      dpr_for_3: [],
      all: [],
    };
    if (hasBodyGroups) {
      (Object.keys(groupsFromBody) as Array<Exclude<DprBatch, "all">>).forEach((key) => {
        grouped[key].push(...groupsFromBody[key]);
        grouped.all.push(...groupsFromBody[key]);
      });
    } else {
      (recipientRows || []).forEach((row: any) => {
        const email = String(row?.email || "").trim();
        if (!email) return;
        const key = categoryBatchKey(String(row?.category || ""));
        grouped[key].push(email);
        grouped.all.push(email);
      });
    }

    const selected: DprBatch = batch in grouped ? batch : "principal_dpr";
    const toList = normalizeEmails(grouped[selected]).slice(0, 20);
    if (!toList.length) {
      return NextResponse.json({ error: "No recipients in selected batch" }, { status: 400 });
    }

    const dpr = body?.dpr || {};
    const openingSentence = String(dpr.openingSentence || "").trim();
    const prospects = String(dpr.prospects || dpr.estimates || "").trim();
    const lineUp = String(dpr.lineUp || "").trim();
    const shiftReport = String(dpr.shiftReport || "").trim();
    const stowplan = String(dpr.stowplan || dpr.fieldC || "").trim();
    const runningSof = String(dpr.runningSof || "").trim();
    const note = String(dpr.note || dpr.notes || "").trim();
    const subject = `DPR - ${appointment.vessel_name} - ${todayLabel()}`;
    const bodyLines = [
      `Daily Prospect Report`,
      `${appointment.vessel_name} | ${appointment.port || "-"} | ${appointment.terminal || "-"}`,
    ];
    if (openingSentence) bodyLines.push("", openingSentence);
    if (prospects) bodyLines.push("", "Prospects:", prospects);
    if (lineUp) bodyLines.push("", "Line Up", lineUp);
    if (shiftReport) bodyLines.push("", "Shift report", shiftReport);
    if (stowplan) bodyLines.push("", "Stowplan (with draft)", stowplan);
    if (runningSof) bodyLines.push("", "Running SOF", runningSof);
    if (note) bodyLines.push("", "NOTE", note);
    const bodyText = bodyLines.join("\n");

    const html = buildDprHtml({
      vesselName: appointment.vessel_name,
      port: appointment.port || "-",
      terminal: appointment.terminal || "-",
      openingSentence,
      prospects,
      lineUp,
      shiftReport,
      stowplan,
      runningSof,
      note,
    });

    if (output === "eml") {
      const eml = buildEml({
        to: toList,
        subject,
        plainText: bodyText,
        html,
      });
      const filename = `${sanitizeFileName(appointment.vessel_name)}_${todayLabel().replace(/\s+/g, "_")}.eml`;
      return NextResponse.json({
        data: {
          to: toList,
          subject,
          body: bodyText,
          html,
          eml,
          filename,
          batch: selected,
        },
      });
    }

    const mailto = `mailto:${encodeURIComponent(toList.join(","))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    return NextResponse.json({
      data: {
        to: toList,
        subject,
        body: bodyText,
        html,
        mailto,
        batch: selected,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compose DPR email" },
      { status: 500 },
    );
  }
}
