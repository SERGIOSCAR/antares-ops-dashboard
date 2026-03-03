import { NextRequest, NextResponse } from "next/server";
import { sendShiftReportEmail } from "@/lib/email/send-shift-report";
import { ShiftSubmitSchema } from "@/lib/zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { classifySofDay } from "@/lib/sof";

const PRE_OP_REASON_PREFIX = "[PRE_OPERATION_SOF] ";
const DRAFT_META_GRADE = {
  fwd: "__META_DRAFT_FWD__",
  mean: "__META_DRAFT_MEAN__",
  aft: "__META_DRAFT_AFT__",
} as const;

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

const normalizeRecipientList = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[;,]/)
      .map((v) => String(v || "").trim())
      .filter(Boolean);
  }
  return [];
};


function normalizeFromTo(
  shiftStartISO: string,
  fromHHMM: string,
  toHHMM?: string | null
): { from: string; to: string | null } {
  const baseDate = shiftStartISO.split("T")[0];

  const mkISO = (hhmm: string): string => {
    const clean = String(hhmm || "").trim();
    if (!/^\d{2}:\d{2}$/.test(clean)) {
      throw new Error(`Invalid time (expected HH:MM): "${hhmm}"`);
    }
    return `${baseDate}T${clean}:00`;
  };

  const from = mkISO(fromHHMM);

  if (!toHHMM || String(toHHMM).trim() === "") {
    return { from, to: null };
  }

  let to = mkISO(toHHMM);

  if (to < from) {
    const d = new Date(`${baseDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const nextDay = d.toISOString().split("T")[0];
    to = `${nextDay}T${String(toHHMM).trim()}:00`;
  }

  return { from, to };
}


export async function POST(req: NextRequest) {
  try {
    let emailStatus: { success: boolean; error?: string; emailId?: string } = {
      success: false,
      error: "Email not attempted",
    };

    const body = await req.json();
    const parsed = ShiftSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      vesselId,
      shiftStart,
      shiftEnd,
      notes,
      recipients,
      lines: incomingLines,
      cargoData,
      delays,
      isRevised,
    } = parsed.data;

    if (!vesselId) {
      return NextResponse.json({ error: "Missing vesselId" }, { status: 400 });
    }
    if (!shiftStart || !shiftEnd) {
      return NextResponse.json({ error: "Missing shift times" }, { status: 400 });
    }

    const forceOverwrite = Boolean(isRevised);
    const admin = supabaseAdmin();

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for existing shift
    const { data: existingList, error: existingShiftErr } = await admin
      .from("shift_reports")
      .select("id")
      .eq("vessel_id", vesselId)
      .eq("shift_start", shiftStart)
      .eq("shift_end", shiftEnd)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingShiftErr) throw existingShiftErr;

    const existingShift = existingList?.[0] ?? null;

    if (existingShift && !forceOverwrite) {
      return NextResponse.json({ error: "SHIFT_ALREADY_EXISTS" }, { status: 409 });
    }

    // If overwriting, delete existing data
    if (existingShift && forceOverwrite) {
      const shiftIdToReplace = existingShift.id;

      const { error: delLinesErr } = await admin
        .from("shift_lines")
        .delete()
        .eq("shift_id", shiftIdToReplace);
      if (delLinesErr) throw delLinesErr;

      const { error: delEventsErr } = await admin
        .from("shift_delays")
        .delete()
        .eq("shift_id", shiftIdToReplace);
      if (delEventsErr) throw delEventsErr;

      const { error: delShiftErr } = await admin
        .from("shift_reports")
        .delete()
        .eq("id", shiftIdToReplace);
      if (delShiftErr) throw delShiftErr;
    }

    // Create shift report
    const { data: report, error: reportError } = await admin
      .from("shift_reports")
      .insert({
        vessel_id: vesselId,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (reportError) throw reportError;

    const shiftId = report.id as string;

    type CargoLine = { 
      hold: number; 
      grade: string; 
      thisShiftMT: number;
      accumulatedMT?: number;
      remainingMT?: number;
      condition?: string;
    };

    function buildLinesFromCargoData(cd: any): CargoLine[] {
      if (!cd || typeof cd !== "object") return [];
      const lines: CargoLine[] = [];

      for (const [holdKey, gradeObj] of Object.entries(cd)) {
        const hold = Number(holdKey);
        if (!Number.isFinite(hold) || hold <= 0) continue;
        if (!gradeObj || typeof gradeObj !== "object") continue;

        for (const [grade, mtRaw] of Object.entries(gradeObj as Record<string, any>)) {
          const mt = Number(mtRaw);
          if (!grade) continue;
          if (!Number.isFinite(mt)) continue;
          if (mt === 0) continue;
          lines.push({ hold, grade, thisShiftMT: mt });
        }
      }

      lines.sort((a, b) => (a.hold - b.hold) || a.grade.localeCompare(b.grade));
      return lines;
    }

    // Use incoming lines if provided, otherwise build from cargoData
    let lines: CargoLine[] = [];
    if (incomingLines.length > 0) {
      lines = incomingLines
        .map((l: any) => ({
        hold: Number(l.hold),
        grade: String(l.grade),
        thisShiftMT: Number(l.thisShiftMT),
        accumulatedMT: Number(l.accumulatedMT) || undefined,
        remainingMT: Number(l.remainingMT) || undefined,
        condition: String(l.condition || ""),
      }))
        .filter(
          (l) =>
            Number.isFinite(l.hold) &&
            l.hold > 0 &&
            !!l.grade &&
            Number.isFinite(l.thisShiftMT) &&
            l.thisShiftMT !== 0
        );
    } else {
      lines = buildLinesFromCargoData(cargoData);
    }

    if (lines.length > 0) {
      const { error: linesError } = await admin
        .from("shift_lines")
        .insert(
          lines.map((l) => ({
            shift_id: shiftId,
            hold: l.hold,
            grade: l.grade,
            this_shift_mt: l.thisShiftMT,
          }))
        );

      if (linesError) throw linesError;
    }

    // Insert delays/events
    if (delays.length > 0) {
      const { error: delaysError } = await admin
        .from("shift_delays")
        .insert(
          delays.map((d: any) => {
            const { from, to } = normalizeFromTo(shiftStart, d.from, d.to);
            return {
              shift_id: shiftId,
              from_time: from,
              to_time: to,
              reason: d.reason ?? "",
            };
          })
        );

      if (delaysError) throw delaysError;
    }

    // Email pipeline is best-effort only: shift submission must not fail if email/data enrichment fails.
    try {
      // Recap rows (cumulative loaded per hold/grade)
      const { data: recapRows } = await admin.rpc(
        "get_vessel_cumulative_load",
        { p_vessel_id: vesselId }
      );

      // Get vessel + recipients
      const { data: vessel } = await admin
        .from("vessels")
        .select("name, port, terminal, operation_type, default_recipients")
        .eq("id", vesselId)
        .single();

      const defaultRecipients = normalizeRecipientList(vessel?.default_recipients);
      const additionalRecipients = normalizeRecipientList(recipients);
      const allRecipients = [...new Set([...defaultRecipients, ...additionalRecipients])];

      if (vessel && allRecipients.length > 0) {
        const emailPrepAndSend = async () => {
          const { data: reportTimeline, error: timelineErr } = await admin
            .from("shift_reports")
            .select("id, shift_start, shift_end")
            .eq("vessel_id", vesselId)
            .lte("shift_end", shiftEnd)
            .order("shift_start", { ascending: true });

          if (timelineErr) throw timelineErr;

          const allShiftIdsUptoNow = (reportTimeline || []).map((r: any) => r.id as string);
          const previousShiftIds = allShiftIdsUptoNow.filter((id: string) => id !== shiftId);

          let previousShiftDelays: Array<{ from: string; to: string; reason: string }> = [];
          let runningSofDelays: Array<{ from: string; to: string; reason: string }> = [];
          let thisShiftDelaysForEmail: Array<{ from: string; to: string; reason: string }> = [];

          if (allShiftIdsUptoNow.length > 0) {
            const { data: allDelaysRows, error: allDelaysErr } = await admin
              .from("shift_delays")
              .select("from_time, to_time, reason")
              .in("shift_id", allShiftIdsUptoNow)
              .order("from_time", { ascending: true });

            if (allDelaysErr) throw allDelaysErr;

            runningSofDelays = (allDelaysRows || []).map((row: any) => ({
              from: String(row.from_time || ""),
              to: String(row.to_time || ""),
              reason: String(row.reason || ""),
            }));
          }

          {
            const { data: thisShiftDelayRows, error: thisShiftDelayErr } = await admin
              .from("shift_delays")
              .select("from_time, to_time, reason")
              .eq("shift_id", shiftId)
              .order("from_time", { ascending: true });

            if (thisShiftDelayErr) throw thisShiftDelayErr;

            thisShiftDelaysForEmail = (thisShiftDelayRows || []).map((row: any) => ({
              from: String(row.from_time || ""),
              to: String(row.to_time || ""),
              reason: String(row.reason || ""),
            }));
          }

          if (previousShiftIds.length > 0) {
            const { data: previousDelayRows, error: prevDelaysErr } = await admin
              .from("shift_delays")
              .select("from_time, to_time, reason")
              .in("shift_id", previousShiftIds)
              .order("from_time", { ascending: true });

            if (prevDelaysErr) throw prevDelaysErr;

            previousShiftDelays = (previousDelayRows || []).map((row: any) => ({
              from: String(row.from_time || ""),
              to: String(row.to_time || ""),
              reason: String(row.reason || ""),
            }));
          }

          let preOpRows: any[] = [];
          {
            const attempts = [
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, event_type, notes, reason")
                  .eq("vessel_id", vesselId)
                  .eq("event_type", "PRE_OPERATION_SOF")
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, event_type, from_time, to_time, reason")
                  .eq("vessel_id", vesselId)
                  .eq("event_type", "PRE_OPERATION_SOF")
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, notes, reason")
                  .eq("vessel_id", vesselId)
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, from_time, to_time, reason")
                  .eq("vessel_id", vesselId)
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, reason")
                  .eq("vessel_id", vesselId)
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, notes")
                  .eq("vessel_id", vesselId)
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at, from_time, to_time")
                  .eq("vessel_id", vesselId)
                  .order("created_at", { ascending: true }),
              () =>
                admin
                  .from("vessel_events")
                  .select("created_at")
                  .eq("vessel_id", vesselId)
                  .order("created_at", { ascending: true }),
            ];

            let lastError: any = null;
            for (const attempt of attempts) {
              const res = await attempt();
              if (!res.error) {
                preOpRows = res.data || [];
                lastError = null;
                break;
              }
              if (!isMissingColumnError(res.error)) {
                throw res.error;
              }
              lastError = res.error;
            }

            if (lastError) {
              // Do not fail the email pipeline if optional vessel_events columns
              // are unavailable in this deployment schema.
              console.warn("Skipping pre-operation SOF enrichment due to schema mismatch:", lastError);
              preOpRows = [];
            }
          }

          const preOpRunningEvents = (preOpRows || []).map((row: any) => {
            let parsed: any = {};
            try {
              parsed = row.notes ? JSON.parse(String(row.notes || "{}")) : {};
            } catch {
              parsed = {};
            }

            const rawReason = String(parsed.reason || row.reason || row.notes || "");
            const isPreOpEvent =
              String(row.event_type || "") === "PRE_OPERATION_SOF" ||
              String(parsed.source || "") === "PRE_OPERATION_SOF" ||
              rawReason.startsWith(PRE_OP_REASON_PREFIX);

            if (!isPreOpEvent) return null;

            return {
              from: String(parsed.from || row.from_time || row.created_at || ""),
              to: parsed.to ? String(parsed.to) : String(row.to_time || ""),
              reason: rawReason.startsWith(PRE_OP_REASON_PREFIX)
                ? rawReason.slice(PRE_OP_REASON_PREFIX.length)
                : rawReason || "PRE-OPERATION EVENT",
            };
          }).filter(Boolean) as Array<{ from: string; to: string; reason: string }>;

          const combinedRunningSof = [...preOpRunningEvents, ...runningSofDelays]
            .sort((a, b) => String(a.from).localeCompare(String(b.from)))
            .map((row) => ({
              ...row,
              dayType: classifySofDay(row.from),
            }));

          const { data: stowRows, error: stowErr } = await admin
            .from("stow_plans")
            .select("*")
            .eq("vessel_id", vesselId)
            .order("hold", { ascending: true });

          if (stowErr) throw stowErr;

          const isDraftMetaRow = (row: any) =>
            String(row?.grade || "") === DRAFT_META_GRADE.fwd ||
            String(row?.grade || "") === DRAFT_META_GRADE.mean ||
            String(row?.grade || "") === DRAFT_META_GRADE.aft;

          const readMetaDraft = (key: keyof typeof DRAFT_META_GRADE) => {
            const row = (stowRows || []).find(
              (r: any) => String(r?.grade || "") === DRAFT_META_GRADE[key]
            );
            const value = Number(row?.total_mt);
            return Number.isFinite(value) ? value : 0;
          };

          const fallbackDrafts = {
            fwd: readMetaDraft("fwd"),
            mean: readMetaDraft("mean"),
            aft: readMetaDraft("aft"),
          };

          const stowPlan = (stowRows || [])
            .filter((row: any) => !isDraftMetaRow(row))
            .map((row: any) => ({
            hold: Number(row.hold),
            grade: String(row.grade || ""),
            total_mt: Number(row.total_mt || 0),
            condition: row.condition ?? "",
            draft_fwd:
              row.draft_fwd == null || !Number.isFinite(Number(row.draft_fwd))
                ? fallbackDrafts.fwd
                : Number(row.draft_fwd),
            draft_mean:
              row.draft_mean == null || !Number.isFinite(Number(row.draft_mean))
                ? fallbackDrafts.mean
                : Number(row.draft_mean),
            draft_aft:
              row.draft_aft == null || !Number.isFinite(Number(row.draft_aft))
                ? fallbackDrafts.aft
                : Number(row.draft_aft),
          }));

          const normalizedDelaysForEmail = (delays || []).map((d: any) => ({
            from: String(d.from || ""),
            to: String(d.to || ""),
            reason: String(d.reason || ""),
          }));

          const emailResult = await sendShiftReportEmail({
            vesselName: vessel.name,
            port: vessel.port,
            terminal: vessel.terminal,
            operationType: vessel.operation_type,
            shiftStart,
            shiftEnd,
            cargoLines: lines,
            delays: thisShiftDelaysForEmail.length > 0 ? thisShiftDelaysForEmail : normalizedDelaysForEmail,
            notes,
            stowPlan,
            recapRows: recapRows || [],
            previousShiftDelays,
            runningSofDelays: combinedRunningSof,
            recipients: allRecipients.join(","),
            isRevised: forceOverwrite,
          });

          if (!emailResult?.success) {
            console.error("Shift email delivery warning:", emailResult?.error || "Unknown email delivery issue");
            emailStatus = {
              success: false,
              error: emailResult?.error || "Unknown email delivery issue",
            };
          } else {
            emailStatus = {
              success: true,
              emailId: emailResult.emailId,
            };
          }
        };

        // Important for delivery reliability: await full email pipeline.
        // We still keep this whole block best-effort (catch below),
        // so email failures won't fail shift submission.
        await emailPrepAndSend();
      } else {
        emailStatus = {
          success: false,
          error: "No recipients configured",
        };
      }
    } catch (emailError) {
      console.error("Shift email pipeline warning:", emailError);
      emailStatus = {
        success: false,
        error: emailError instanceof Error ? emailError.message : "Unknown email pipeline error",
      };
    }

    return NextResponse.json({
      success: true,
      reportId: shiftId,
      email: emailStatus,
    });

  } catch (error: any) {
    console.error("Shift submission error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to submit shift" },
      { status: 500 }
    );
  }
}
