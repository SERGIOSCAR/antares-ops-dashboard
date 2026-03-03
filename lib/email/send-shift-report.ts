import { Resend } from "resend";

type ShiftReportEmailData = {
  vesselName: string;
  port: string;
  terminal: string;
  operationType: string;
  shiftStart: string;
  shiftEnd: string;
  cargoLines: Array<{ 
    hold: number; 
    grade: string; 
    thisShiftMT: number;
    accumulatedMT?: number;
    remainingMT?: number;
    condition?: string;
  }>;
  delays: Array<{ from: string; to: string; reason: string }>;
  previousShiftDelays?: Array<{ from: string; to: string; reason: string }>;
  runningSofDelays?: Array<{ from: string; to: string; reason: string; dayType?: string }>;
  notes: string;
  stowPlan: Array<{
    hold: number;
    grade: string;
    total_mt: number;
    condition?: string | null;
    draft_fwd?: number | null;
    draft_mean?: number | null;
    draft_aft?: number | null;
  }>;
  recipients: string | string[];
  recapRows?: Array<Record<string, unknown>>;
  isRevised?: boolean;
};

export async function sendShiftReportEmail(data: ShiftReportEmailData) {
  const {
    vesselName,
    port,
    terminal,
    operationType,
    shiftStart,
    shiftEnd,
    cargoLines,
    delays,
    runningSofDelays,
    notes,
    stowPlan,
    recipients,
    isRevised,
  } = data;

  const toNumber = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const toString = (value: unknown) => String(value ?? "").trim();
  const makeKey = (hold: unknown, grade: unknown) => {
    const holdNo = toNumber(hold);
    const gradeName = toString(grade).toLowerCase();
    return `${holdNo}|${gradeName}`;
  };

  const thisShiftMap = new Map<string, number>();
  const lineAccumulatedMap = new Map<string, number>();
  const lineConditionMap = new Map<string, string>();
  const lineConditionByHoldMap = new Map<number, string>();

  cargoLines.forEach((line) => {
    const key = makeKey(line.hold, line.grade);
    thisShiftMap.set(key, (thisShiftMap.get(key) || 0) + toNumber(line.thisShiftMT));
    if (line.accumulatedMT !== undefined) {
      lineAccumulatedMap.set(key, toNumber(line.accumulatedMT));
    }
    const condition = toString(line.condition);
    if (condition) {
      lineConditionMap.set(key, condition);
      if (toNumber(line.hold) > 0) {
        lineConditionByHoldMap.set(toNumber(line.hold), condition);
      }
    }
  });

  const recapAccumulatedMap = new Map<string, number>();
  (data.recapRows || []).forEach((row) => {
    const hold = toNumber(row.hold ?? row.hold_no ?? row.hold_number);
    const grade = toString(row.grade ?? row.cargo_grade ?? row.product);
    const accumulated = toNumber(
      row.cumulative_mt ?? row.accumulated_mt ?? row.total_loaded_mt ?? row.loaded_mt ?? row.total_mt
    );
    if (hold > 0 && grade) {
      recapAccumulatedMap.set(makeKey(hold, grade), accumulated);
    }
  });

  const stowMap = new Map<string, number>();
  const stowConditionMap = new Map<string, string>();
  const stowConditionByHoldMap = new Map<number, string>();
  stowPlan.forEach((row) => {
    const key = makeKey(row.hold, row.grade);
    stowMap.set(key, toNumber(row.total_mt));
    const condition = toString(row.condition);
    stowConditionMap.set(key, condition);
    if (toNumber(row.hold) > 0 && condition) {
      stowConditionByHoldMap.set(toNumber(row.hold), condition);
    }
  });

  const allKeys = new Set<string>([
    ...Array.from(stowMap.keys()),
    ...Array.from(thisShiftMap.keys()),
    ...Array.from(recapAccumulatedMap.keys()),
    ...Array.from(lineAccumulatedMap.keys()),
  ]);

  const displayRows = Array.from(allKeys)
    .map((key) => {
      const [holdRaw, ...gradeParts] = key.split("|");
      const hold = toNumber(holdRaw);
      const grade = gradeParts.join("|");
      const plannedMT = toNumber(stowMap.get(key));
      const thisShiftMT = toNumber(thisShiftMap.get(key));
      const accumulatedMT =
        recapAccumulatedMap.has(key)
          ? toNumber(recapAccumulatedMap.get(key))
          : toNumber(lineAccumulatedMap.get(key));
      const remainingMT = plannedMT - accumulatedMT;
      const rawCondition =
        lineConditionMap.get(key) ||
        lineConditionByHoldMap.get(hold) ||
        stowConditionMap.get(key) ||
        stowConditionByHoldMap.get(hold) ||
        "";

      // Fallback for deployments/data where condition is not stored yet:
      // infer a sensible operational state from accumulated vs plan.
      const condition = rawCondition || (
        plannedMT <= 0
          ? ""
          : accumulatedMT <= 0
          ? "empty"
          : accumulatedMT >= plannedMT
          ? "full"
          : "slack"
      );

      return {
        hold,
        grade,
        thisShiftMT,
        accumulatedMT,
        remainingMT,
        plannedMT,
        condition,
      };
    })
    .filter((row) => row.hold > 0 && row.grade)
    .sort((a, b) => (a.hold - b.hold) || a.grade.localeCompare(b.grade));

  // Calculate totals using complete hold list (including zero this-shift rows)
  const shiftTotal = displayRows.reduce((sum, row) => sum + row.thisShiftMT, 0);
  const accumulatedTotal = displayRows.reduce((sum, row) => sum + row.accumulatedMT, 0);
  const remainingTotal = displayRows.reduce((sum, row) => sum + row.remainingMT, 0);
  const plannedTotal = displayRows.reduce((sum, row) => sum + row.plannedMT, 0);
  const shiftRatePerHour = shiftTotal / 6;
  const formatMT = (value: number) => {
    const rounded = Math.round(Number(value || 0) * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  };
  const formatPct = (value: number, total: number) => {
    if (!Number.isFinite(total) || total <= 0) return "-";
    const pct = (value / total) * 100;
    const rounded = Math.round(pct * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
  };
  const movementWord = String(operationType || "").toUpperCase() === "DISCHARGE" ? "Discharged" : "Loaded";
  const movementHeading =
    String(operationType || "").toUpperCase() === "DISCHARGE" || String(operationType || "").toUpperCase() === "LOAD"
      ? `${movementWord} This Shift`
      : "Operated This Shift";
  const stowTotals: Record<string, number> = {};
  stowPlan.forEach(({ grade, total_mt }) => {
    stowTotals[grade] = (stowTotals[grade] || 0) + total_mt;
  });
  const stowGrandTotal = Object.values(stowTotals).reduce((sum, val) => sum + val, 0);
  const draftRow = stowPlan.find((row) =>
    row.draft_fwd != null || row.draft_mean != null || row.draft_aft != null
  ) || stowPlan[0];
  const formatDraft = (value: number | null | undefined) => {
    const num = value == null || !Number.isFinite(Number(value)) ? 0 : Number(value);
    const fixed = num.toFixed(2);
    const [whole, fraction] = fixed.split(".");
    return `${whole.padStart(2, "0")}.${fraction || "00"}`;
  };
  const draftFwd = formatDraft(draftRow?.draft_fwd);
  const draftMean = formatDraft(draftRow?.draft_mean);
  const draftAft = formatDraft(draftRow?.draft_aft);
  const stowGradeEntries = Object.entries(stowTotals).map(([grade, mt]) => ({ grade, mt }));
  const stowGradesSummary = stowGradeEntries.map((x) => `${formatMT(x.mt)} MT ${x.grade}`).join(" + ");
  const totalGradeLabel = stowGradeEntries[0]?.grade || "";
  const totalBasisLabel =
    stowGradeEntries.length <= 1
      ? `${formatMT(stowGrandTotal)} MT${totalGradeLabel ? ` ${totalGradeLabel}` : ""}`
      : `${formatMT(stowGrandTotal)} MT (${stowGradesSummary})`;
  const stowBasisSummary = [
    `Total: ${totalBasisLabel}`,
    `Drafts: FWD: ${draftFwd} - MEAN: ${draftMean} - AFT: ${draftAft}`,
  ].filter(Boolean).join(" - ");

  // Format dates
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatEventTime = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const hhmmMatch = raw.match(/T(\d{2}:\d{2})/);
    if (hhmmMatch?.[1]) return hhmmMatch[1].replace(":", "");
    if (/^\d{2}:\d{2}$/.test(raw)) return raw.replace(":", "");
    if (/^\d{4}$/.test(raw)) return raw;

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).replace(":", "");
    }

    return raw;
  };

  const formatEventDate = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "-";

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const dd = parsed.toLocaleDateString("en-GB", { day: "2-digit" });
      const mmm = parsed.toLocaleDateString("en-GB", { month: "short" });
      const ddd = parsed.toLocaleDateString("en-GB", { weekday: "short" });
      return `${dd}-${mmm} ${ddd}`;
    }

    return "-";
  };

  const runningEvents = runningSofDelays || [];
  const shiftEvents = delays || [];

  // We always render accumulated/remaining to show full operational balance
  const hasAccumulatedData = true;

  // Build HTML email
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #1a1a1a; color: white; padding: 20px; }
        ${isRevised ? '.revised-banner { background: #ff9800; color: white; padding: 15px; text-align: center; font-weight: bold; font-size: 18px; }' : ''}
        .content { padding: 20px; }
        .info-box { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; font-weight: bold; }
        .total-row { font-weight: bold; background: #e8f4f8; }
        .accumulated-col { background: #e3f2fd; }
        .remaining-col { background: #e8f5e9; }
        .negative { color: #c62828; font-weight: 700; }
        .event-table { table-layout: fixed; }
        .event-table th, .event-table td { vertical-align: top; word-break: break-word; white-space: normal; }
        .event-date { width: 90px; white-space: nowrap; }
        .event-time { width: 75px; white-space: nowrap; text-align: center; }
        .event-reason { width: auto; }
        .signature-logo { margin-top: 16px; }
        h2 { font-size: 30px; margin: 16px 0 8px; font-weight: 700; }
      </style>
    </head>
    <body>
      ${isRevised ? '<div class="revised-banner">⚠️ REVISED SHIFT</div>' : ''}
      
      <div class="header">
        <h1>Shift Report - ${vesselName}</h1>
        <p>${port} / ${terminal} • ${operationType}</p>
      </div>
      
      <div class="content">
        <h2>Shift Period</h2>
        <div class="info-box">
          ${formatDate(shiftStart)} → ${formatDate(shiftEnd)}
        </div>

        <h2>Stow Plan Basis</h2>
        <div class="info-box">
          ${stowBasisSummary}
        </div>

        <h2>${movementHeading}</h2>
        <table>
          <thead>
            <tr>
              <th>Hold</th>
              <th>Grade</th>
                <th>${movementWord} This Shift (MT)</th>
                ${hasAccumulatedData ? `<th class="accumulated-col">${movementWord} So Far (MT)</th>` : ''}
                ${hasAccumulatedData ? '<th class="remaining-col">Balance To Go (MT)</th>' : ''}
                <th>Stowplan (MT)</th>
                <th>Condition</th>
            </tr>
          </thead>
          <tbody>
            ${displayRows.map(line => `
              <tr>
                <td>${line.hold}</td>
                <td>${line.grade}</td>
                <td>${formatMT(line.thisShiftMT)}</td>
                ${hasAccumulatedData ? `<td class="accumulated-col ${line.accumulatedMT < 0 ? "negative" : ""}">${formatMT(line.accumulatedMT || 0)} - ${formatPct(line.accumulatedMT || 0, line.plannedMT)}</td>` : ''}
                ${hasAccumulatedData ? `<td class="remaining-col ${line.remainingMT < 0 ? "negative" : ""}">${formatMT(line.remainingMT || 0)} - ${formatPct(line.remainingMT || 0, line.plannedMT)}</td>` : ''}
                <td>${formatMT(line.plannedMT)}</td>
                <td>${line.condition || '-'}</td>
              </tr>
            `).join("")}
            <tr class="total-row">
              <td colspan="2">TOTALS</td>
              <td>${formatMT(shiftTotal)}</td>
              ${hasAccumulatedData ? `<td class="accumulated-col ${accumulatedTotal < 0 ? "negative" : ""}">${formatMT(accumulatedTotal)}</td>` : ""}
              ${hasAccumulatedData ? `<td class="remaining-col ${remainingTotal < 0 ? "negative" : ""}">${formatMT(remainingTotal)}</td>` : ""}
              <td>${formatMT(plannedTotal)}</td>
              <td>-</td>
            </tr>
            <tr class="total-row">
              <td colspan="7">Rate achieved this shift ${Math.round(shiftRatePerHour)} MT per Hour</td>
            </tr>
          </tbody>
        </table>

        ${shiftEvents.length > 0 ? `
          <h2>Events / Interruptions (This Shift)</h2>
          <table class="event-table">
            <thead>
              <tr>
                <th class="event-date">Date</th>
                <th class="event-time">Time</th>
                <th class="event-time"></th>
                <th class="event-reason">Event</th>
              </tr>
            </thead>
            <tbody>
              ${shiftEvents.map(delay => `
                <tr>
                  <td class="event-date">${formatEventDate(delay.from)}</td>
                  <td class="event-time">${formatEventTime(delay.from)}</td>
                  <td class="event-time">${delay.to ? formatEventTime(delay.to) : '-'}</td>
                  <td class="event-reason">${delay.reason}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : ""}

        ${runningEvents.length > 0 ? `
          <h2>Running SOF</h2>
          <table class="event-table">
            <thead>
              <tr>
                <th class="event-date">Date</th>
                <th class="event-time">Time</th>
                <th class="event-time"></th>
                <th class="event-reason">Event</th>
              </tr>
            </thead>
            <tbody>
              ${runningEvents.map(delay => `
                <tr>
                  <td class="event-date">${formatEventDate(delay.from)}</td>
                  <td class="event-time">${formatEventTime(delay.from)}</td>
                  <td class="event-time">${delay.to ? formatEventTime(delay.to) : '-'}</td>
                  <td class="event-reason">${delay.reason}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : ""}

        ${notes ? `
          <h2>Notes</h2>
          <div class="info-box">
            ${notes.replace(/\n/g, "<br/>")}
          </div>
        ` : ""}

        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          This report is generated and submitted automatically via Antares ShiftReporter application. Please do not reply to this message. For any enquiries, kindly contact antares@antaresshipping.com.
        </p>
      </div>
    </body>
    </html>
  `;

  // Normalize recipients to array
  const recipientArray = Array.isArray(recipients) 
    ? recipients 
    : recipients.split(',').map(r => r.trim()).filter(Boolean);

  if (recipientArray.length === 0) {
    return { success: false, error: "No recipients configured" };
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const fromAddress = process.env.EMAIL_FROM?.trim() || "";

  if (!fromAddress) {
    return { success: false, error: "EMAIL_FROM is not configured" };
  }

  try {
    const subject = `${isRevised ? "Revised Shift - " : ""}Shift Report - ${vesselName} - ${formatDate(shiftStart)}`;
    const recipientEmail = recipientArray;
    const resend = new Resend(process.env.RESEND_API_KEY);

    const response = await resend.emails.send({
      from: fromAddress,
      to: recipientEmail,
      subject,
      html,
    });

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return { success: true, emailId: response.data?.id || "" };
  } catch (error: unknown) {
    console.error("Email send error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown email send error" };
  }
}





