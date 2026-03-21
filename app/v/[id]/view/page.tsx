import { supabaseAdmin } from "@/lib/supabase/admin";

type ShiftLineRow = {
  hold: number | null;
  grade: string | null;
  this_shift_mt: number | null;
};

type StowRow = {
  hold: number | null;
  grade: string | null;
  total_mt: number | null;
  condition: string | null;
  draft_fwd: number | null;
  draft_mean: number | null;
  draft_aft: number | null;
};

function isMissingConditionColumn(message?: string) {
  return String(message || "").toLowerCase().includes("condition");
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtMt(value?: number | null) {
  if (!Number.isFinite(Number(value))) return "0";
  return Number(value).toLocaleString();
}

export default async function VesselPublicViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: vessel } = await admin
    .from("vessels")
    .select("id,name,port,terminal,operation_type,holds,cargo_grades")
    .eq("short_id", id)
    .maybeSingle();

  if (!vessel) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8 text-slate-100">
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4">
          Vessel view not found.
        </div>
      </main>
    );
  }

  const { data: latestShift } = await admin
    .from("shift_reports")
    .select("id,shift_start,shift_end,notes,created_at")
    .eq("vessel_id", vessel.id)
    .order("shift_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestShiftId = String(latestShift?.id || "");
  const { data: latestShiftLines } = latestShiftId
    ? await admin
        .from("shift_lines")
        .select("hold,grade,this_shift_mt")
        .eq("shift_id", latestShiftId)
        .order("hold", { ascending: true })
    : { data: [] as ShiftLineRow[] };

  const { data: shiftReports } = await admin
    .from("shift_reports")
    .select("id")
    .eq("vessel_id", vessel.id);
  const shiftIds = (shiftReports || []).map((r: any) => r.id).filter(Boolean);

  const { data: allShiftLines } = shiftIds.length
    ? await admin
        .from("shift_lines")
        .select("hold,grade,this_shift_mt")
        .in("shift_id", shiftIds)
    : { data: [] as ShiftLineRow[] };

  let stowRes: any = await admin
    .from("stow_plans")
    .select("hold,grade,total_mt,condition,draft_fwd,draft_mean,draft_aft")
    .eq("vessel_id", vessel.id)
    .order("hold", { ascending: true });
  if (stowRes.error && isMissingConditionColumn(stowRes.error.message)) {
    stowRes = await admin
      .from("stow_plans")
      .select("hold,grade,total_mt,draft_fwd,draft_mean,draft_aft")
      .eq("vessel_id", vessel.id)
      .order("hold", { ascending: true });
  }
  const stowRows = stowRes.data as StowRow[] | null;

  const mapLatest = new Map<string, number>();
  (latestShiftLines || []).forEach((row) => {
    const hold = Number(row.hold || 0);
    const grade = String(row.grade || "");
    if (!hold || !grade) return;
    mapLatest.set(`${hold}|${grade}`, (mapLatest.get(`${hold}|${grade}`) || 0) + Number(row.this_shift_mt || 0));
  });

  const mapAccum = new Map<string, number>();
  (allShiftLines || []).forEach((row) => {
    const hold = Number(row.hold || 0);
    const grade = String(row.grade || "");
    if (!hold || !grade) return;
    mapAccum.set(`${hold}|${grade}`, (mapAccum.get(`${hold}|${grade}`) || 0) + Number(row.this_shift_mt || 0));
  });

  const stow = (stowRows || []).filter((row: any) => !String(row.grade || "").startsWith("__META_DRAFT_")) as StowRow[];
  const displayRows = stow.map((row) => {
    const hold = Number(row.hold || 0);
    const grade = String(row.grade || "");
    const key = `${hold}|${grade}`;
    const planned = Number(row.total_mt || 0);
    const thisShift = mapLatest.get(key) || 0;
    const loaded = mapAccum.get(key) || 0;
    const remaining = planned - loaded;
    return {
      hold,
      grade,
      planned,
      thisShift,
      loaded,
      remaining,
      condition: row.condition || "",
    };
  });

  const draftSource = stow.find((row) => Number(row.draft_fwd || 0) || Number(row.draft_mean || 0) || Number(row.draft_aft || 0));

  const { data: runningEvents } = shiftIds.length
    ? await admin
        .from("shift_delays")
        .select("from_time,to_time,reason")
        .in("shift_id", shiftIds)
        .order("from_time", { ascending: true })
    : { data: [] as Array<{ from_time: string; to_time: string | null; reason: string | null }> };

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h1 className="text-xl font-semibold">{vessel.name} - Shift Report VIEW</h1>
          <div className="mt-1 text-sm text-slate-300">
            {vessel.port || "-"} | {vessel.terminal || "-"} | {vessel.operation_type || "-"}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Last shift: {fmtDate(latestShift?.shift_start)} to {fmtDate(latestShift?.shift_end)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-2 text-lg font-semibold">Cargo Recap</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-2 py-2 text-left">Hold</th>
                  <th className="px-2 py-2 text-left">Grade</th>
                  <th className="px-2 py-2 text-right">This Shift (MT)</th>
                  <th className="px-2 py-2 text-right">Loaded So Far (MT)</th>
                  <th className="px-2 py-2 text-right">Balance To Go (MT)</th>
                  <th className="px-2 py-2 text-right">Stowplan (MT)</th>
                  <th className="px-2 py-2 text-left">Condition</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={`${row.hold}-${row.grade}`} className="border-t border-slate-700">
                    <td className="px-2 py-2">{row.hold}</td>
                    <td className="px-2 py-2">{row.grade}</td>
                    <td className="px-2 py-2 text-right">{fmtMt(row.thisShift)}</td>
                    <td className="px-2 py-2 text-right">{fmtMt(row.loaded)}</td>
                    <td className="px-2 py-2 text-right">{fmtMt(row.remaining)}</td>
                    <td className="px-2 py-2 text-right">{fmtMt(row.planned)}</td>
                    <td className="px-2 py-2">{row.condition || "-"}</td>
                  </tr>
                ))}
                {displayRows.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-slate-400" colSpan={7}>
                      No shift data yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-2 text-lg font-semibold">Stowplan (with draft)</h2>
          <div className="text-sm text-slate-300">
            Drafts FWD / MEAN / AFT:{" "}
            {draftSource
              ? `${Number(draftSource.draft_fwd || 0).toFixed(2)} / ${Number(draftSource.draft_mean || 0).toFixed(2)} / ${Number(draftSource.draft_aft || 0).toFixed(2)}`
              : "-"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h2 className="mb-2 text-lg font-semibold">Running SOF</h2>
          {runningEvents && runningEvents.length > 0 ? (
            <div className="space-y-1 text-sm text-slate-200">
              {runningEvents.slice(-40).map((event: any, idx: number) => (
                <div key={`${event.from_time}-${idx}`}>
                  {fmtDate(event.from_time)} {"->"} {fmtDate(event.to_time)} {"|"} {String(event.reason || "").trim() || "-"}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">No running SOF events.</div>
          )}
        </div>

        {String(latestShift?.notes || "").trim() ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h2 className="mb-2 text-lg font-semibold">Notes</h2>
            <div className="whitespace-pre-wrap text-sm text-slate-200">{String(latestShift?.notes || "")}</div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
