import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CommenceButton from "@/components/commence-button";
import ShiftForm from "@/components/shift-form";
import StowPlanEditor from "@/components/stow-plan-editor";
import RunningSofEditor from "@/components/running-sof-editor";
import { formatDateTime } from "@/lib/format-date";

const DRAFT_META_GRADE = {
  fwd: "__META_DRAFT_FWD__",
  mean: "__META_DRAFT_MEAN__",
  aft: "__META_DRAFT_AFT__",
} as const;

export default async function VesselPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  const admin = supabaseAdmin();

  const { data: vessel } = await admin
    .from("vessels")
    .select("*")
    .eq("short_id", id)
    .single();

  if (!vessel) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold text-red-600">Vessel Not Found</h1>
        <p className="mt-2 text-zinc-600">The vessel link is invalid or has been removed.</p>
      </div>
    );
  }

  const { data: stowPlanRows } = await admin
    .from("stow_plans")
    .select("*")
    .eq("vessel_id", vessel.id)
    .order("hold", { ascending: true });

  const isDraftMetaRow = (row: any) =>
    String(row?.grade || "") === DRAFT_META_GRADE.fwd ||
    String(row?.grade || "") === DRAFT_META_GRADE.mean ||
    String(row?.grade || "") === DRAFT_META_GRADE.aft;

  const stowPlan = (stowPlanRows || []).filter((row: any) => !isDraftMetaRow(row));
  const metaRows = (stowPlanRows || []).filter((row: any) => isDraftMetaRow(row));

  const readMetaDraft = (key: keyof typeof DRAFT_META_GRADE) => {
    const row = metaRows.find((r: any) => String(r?.grade || "") === DRAFT_META_GRADE[key]);
    const value = Number(row?.total_mt);
    return Number.isFinite(value) ? value : 0;
  };

  const firstStowRow = stowPlan?.[0];
  const draftFromColumns = {
    fwd: Number(firstStowRow?.draft_fwd),
    mean: Number(firstStowRow?.draft_mean),
    aft: Number(firstStowRow?.draft_aft),
  };
  const initialDrafts = {
    fwd: Number.isFinite(draftFromColumns.fwd) ? draftFromColumns.fwd : readMetaDraft("fwd"),
    mean: Number.isFinite(draftFromColumns.mean) ? draftFromColumns.mean : readMetaDraft("mean"),
    aft: Number.isFinite(draftFromColumns.aft) ? draftFromColumns.aft : readMetaDraft("aft"),
  };

  const { data: shiftReports } = await admin
    .from("shift_reports")
    .select("id")
    .eq("vessel_id", vessel.id);

  const shiftIds = shiftReports?.map((s: any) => s.id) || [];

  const { data: allShiftLines } = await admin
    .from("shift_lines")
    .select("hold, grade, this_shift_mt")
    .in("shift_id", shiftIds);

  const cumulativeTotals: Record<number, Record<string, number>> = {};
  if (allShiftLines && allShiftLines.length > 0) {
    allShiftLines.forEach((line: { hold: number; grade: string; this_shift_mt: number | string | null }) => {
      if (!cumulativeTotals[line.hold]) cumulativeTotals[line.hold] = {};
      if (!cumulativeTotals[line.hold][line.grade]) cumulativeTotals[line.hold][line.grade] = 0;
      cumulativeTotals[line.hold][line.grade] += Number(line.this_shift_mt);
    });
  }

  let profile: any = null;

  if (userData.user) {
    const profileRes = await admin
      .from("profiles")
      .select("role,username")
      .eq("id", userData.user.id)
      .single();
    profile = profileRes.data;
  }

  const isAdmin = profile?.role === "admin";

  const { data: timelineShifts } = await admin
    .from("shift_reports")
    .select("id, shift_start, shift_end")
    .eq("vessel_id", vessel.id)
    .order("shift_start", { ascending: true });

  const timelineShiftIds = (timelineShifts || []).map((s: any) => s.id as string);

  let runningShiftEvents: Array<{ id: string; from: string; to: string; reason: string }> = [];
  if (timelineShiftIds.length > 0) {
    const { data: delayRows } = await admin
      .from("shift_delays")
      .select("id, shift_id, from_time, to_time, reason")
      .in("shift_id", timelineShiftIds)
      .order("from_time", { ascending: true });

    runningShiftEvents = (delayRows || []).map((row: any) => ({
      id: String(row.id || ""),
      from: String(row.from_time || ""),
      to: String(row.to_time || ""),
      reason: String(row.reason || ""),
    }));
  }
  const runningSofEvents = [...runningShiftEvents].sort((a, b) => String(a.from).localeCompare(String(b.from)));

  const commenced = !!vessel.commenced_at;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
        <div className="mb-6 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 p-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">{vessel.name}</h1>
            <p className="text-sm text-slate-300">
              {vessel.port} | {vessel.terminal} | {vessel.operation_type}
            </p>
            <p className="text-sm text-slate-300">
              {vessel.holds} holds | {vessel.cargo_grades?.join(", ") || "No grades"}
            </p>
          </div>
          <div className="mx-4 flex items-center justify-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
            <img
              src="https://antaresshipping.com/wp-content/uploads/2023/12/Antares-Ship-Agent.webp"
              alt="Antares Ship Agents"
              className="h-8 w-auto select-none opacity-90"
              loading="lazy"
            />
            <span className="text-xs uppercase tracking-wide text-slate-300">Ops Platform</span>
          </div>
          <div>
            {!commenced && (
              <span className="rounded-full bg-yellow-500 px-3 py-1 text-xs font-medium text-white">
                Waiting
              </span>
            )}
            {commenced && (
              <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white">
                In Progress
              </span>
            )}
          </div>
        </div>

        {!commenced && (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Operations Not Started</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Click &quot;Commence Operations&quot; to start logging shifts.
            </p>
            <CommenceButton vesselId={vessel.id} />
          </div>
        )}

        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Running SOF</h2>
            <div className="flex items-center gap-2">
              <a
                href="#running-sof-editor"
                className="rounded border border-blue-500/60 bg-blue-600/20 px-3 py-1 text-sm text-blue-200 hover:bg-blue-600/30"
              >
                + Add Event
              </a>
              <a
                href="#running-sof-editor"
                className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
              >
                Edit SOF
              </a>
            </div>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Edit or add events from the controls below.
          </p>
          {runningSofEvents.length === 0 ? (
            <p className="text-sm text-slate-400">No SOF events recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">End Time</th>
                    <th className="px-3 py-2 text-left">Event</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {runningSofEvents.map((event, idx) => (
                    <tr key={`${event.id}-${idx}`} className="odd:bg-slate-800 even:bg-slate-900">
                      <td className="px-3 py-2">{formatDateTime(event.from)}</td>
                      <td className="px-3 py-2">{formatDateTime(event.to)}</td>
                      <td className="px-3 py-2">{event.reason}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <a
                            href="#running-sof-editor"
                            className="text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            Edit
                          </a>
                          <a
                            href="#running-sof-editor"
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            Add
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div id="running-sof-editor">
            <details open>
              <summary className="mt-3 cursor-pointer rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700">
                Edit Running SOF
              </summary>
              <div className="mt-3">
                <RunningSofEditor
                  vesselId={vessel.id}
                  events={runningShiftEvents.map((e) => ({
                    id: e.id,
                    from: e.from,
                    to: e.to,
                    reason: e.reason,
                  }))}
                />
              </div>
            </details>
          </div>
        </div>

        {commenced && (
          <>
            <StowPlanEditor
              vesselId={vessel.id}
              holds={vessel.holds}
              grades={vessel.cargo_grades || []}
              currentPlan={stowPlan || []}
              initialDrafts={initialDrafts}
            />

            <ShiftForm
              vesselId={vessel.id}
              holds={vessel.holds}
              grades={vessel.cargo_grades || []}
              operationType={vessel.operation_type}
              shiftType={vessel.shift_type}
              stowPlan={stowPlan || []}
              cumulativeTotals={cumulativeTotals}
            />
          </>
        )}
      </div>
    </div>
  );
}

