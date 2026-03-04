import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import CommenceButton from "@/components/commence-button";
import ShiftForm from "@/components/shift-form";
import StowPlanEditor from "@/components/stow-plan-editor";
import RunningSofEditor from "@/components/running-sof-editor";
import { classifySofDay, sofDayLabel } from "@/lib/sof";
import { format } from "date-fns";

const DRAFT_META_GRADE = {
  fwd: "__META_DRAFT_FWD__",
  mean: "__META_DRAFT_MEAN__",
  aft: "__META_DRAFT_AFT__",
} as const;

function formatSOFTime(ts: string | Date | null | undefined) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd-MMM-yy HH:mm");
}

export default async function VesselPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await supabaseServer();
  const cookieStore = await cookies();
  const internalAuth = cookieStore.get("antares-auth")?.value === "true";
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user && !internalAuth) redirect("/login");

  const admin = supabaseAdmin();

  const { data: vessel } = await admin
    .from("vessels")
    .select("*")
    .eq("short_id", id)
    .single();

  if (!vessel) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-red-600">Vessel Not Found</h1>
        <p className="text-zinc-600 mt-2">The vessel link is invalid or has been removed.</p>
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

  let membership: any = null;
  let profile: any = null;

  if (userData.user) {
    const membershipRes = await admin
      .from("vessel_members")
      .select("is_head")
      .eq("vessel_id", vessel.id)
      .eq("user_id", userData.user.id)
      .single();
    membership = membershipRes.data;

    const profileRes = await admin
      .from("profiles")
      .select("role,username")
      .eq("id", userData.user.id)
      .single();
    profile = profileRes.data;
  }

  const isAdmin = profile?.role === "admin" || internalAuth;
  const isAgent = profile?.role === "agent";
  const hasAccess = internalAuth || membership || isAdmin || isAgent;

  if (!hasAccess) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="text-zinc-600 mt-2">You don&apos;t have permission to access this vessel.</p>
        <p className="text-sm text-zinc-500 mt-4">Contact your admin for access.</p>
      </div>
    );
  }

  const { data: timelineShifts } = await admin
    .from("shift_reports")
    .select("id, shift_start, shift_end")
    .eq("vessel_id", vessel.id)
    .order("shift_start", { ascending: true });

  const timelineShiftIds = (timelineShifts || []).map((s: any) => s.id as string);
  const shiftOptions = (timelineShifts || []).map((s: any) => ({
    id: String(s.id),
    label: `${formatSOFTime(s.shift_start)} -> ${formatSOFTime(s.shift_end)}`,
  }));

  let runningShiftEvents: Array<{ id: string; shiftId: string; from: string; to: string; reason: string; source: string }> = [];
  if (timelineShiftIds.length > 0) {
    const { data: delayRows } = await admin
      .from("shift_delays")
      .select("id, shift_id, from_time, to_time, reason")
      .in("shift_id", timelineShiftIds)
      .order("from_time", { ascending: true });

    runningShiftEvents = (delayRows || []).map((row: any) => ({
      id: String(row.id || ""),
      shiftId: String(row.shift_id || ""),
      from: String(row.from_time || ""),
      to: String(row.to_time || ""),
      reason: String(row.reason || ""),
      source: "SHIFT",
    }));
  }
  const runningSofEvents = [...runningShiftEvents]
    .sort((a, b) => String(a.from).localeCompare(String(b.from)))
    .map((e) => ({
      ...e,
      dayType: classifySofDay(e.from),
    }));

  const commenced = !!vessel.commenced_at;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{vessel.name}</h1>
            <p className="text-sm text-zinc-600 mt-1">
              {vessel.port} / {vessel.terminal} • {vessel.operation_type}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {vessel.holds} holds • {vessel.cargo_grades?.join(", ") || "No grades"}
            </p>
          </div>
          {!commenced && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
              Not Started
            </span>
          )}
          {commenced && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              In Progress
            </span>
          )}
        </div>
      </div>

      {!commenced && (
        <div className="rounded-2xl border bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-2">Operations Not Started</h2>
          <p className="text-sm text-zinc-600 mb-4">
            Click &quot;Commence Operations&quot; to start logging shifts.
          </p>
          <CommenceButton vesselId={vessel.id} />
        </div>
      )}

      <div className="rounded-2xl border bg-white shadow-sm p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Running SOF</h2>
          {isAdmin && (
            <details>
              <summary className="cursor-pointer rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50">
                Edit Running SOF
              </summary>
              <div className="mt-3">
                <RunningSofEditor
                  vesselId={vessel.id}
                  events={runningShiftEvents.map((e) => ({
                    id: e.id,
                    shiftId: e.shiftId,
                    from: e.from,
                    to: e.to,
                    reason: e.reason,
                  }))}
                  shiftOptions={shiftOptions}
                />
              </div>
            </details>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Only admin users (vessel creation level) can edit previously logged SOF entries.
        </p>
        {runningSofEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">No SOF events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">From</th>
                  <th className="border border-gray-300 p-2 text-left">To</th>
                  <th className="border border-gray-300 p-2 text-left">Day Type</th>
                  <th className="border border-gray-300 p-2 text-left">Source</th>
                  <th className="border border-gray-300 p-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {runningSofEvents.map((event, idx) => (
                  <tr key={`${event.from}-${idx}`}>
                    <td className="border border-gray-300 p-2">{formatSOFTime(event.from)}</td>
                    <td className="border border-gray-300 p-2">{formatSOFTime(event.to)}</td>
                    <td className="border border-gray-300 p-2">{sofDayLabel(event.dayType)}</td>
                    <td className="border border-gray-300 p-2">{event.source}</td>
                    <td className="border border-gray-300 p-2">{event.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  );
}
