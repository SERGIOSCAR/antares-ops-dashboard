import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DRAFT_META_GRADE = new Set(["__META_DRAFT_FWD__", "__META_DRAFT_MEAN__", "__META_DRAFT_AFT__"]);

function extractShortId(link?: string | null) {
  const raw = String(link || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/v\/([^/?#]+)/i);
  return match?.[1] || "";
}

function formatDateTimeShort(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const appointmentId = String(searchParams.get("appointment_id") || "").trim();
    if (!appointmentId) {
      return NextResponse.json({ error: "appointment_id is required" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .select("id,vessel_name,shiftreporter_link")
      .eq("id", appointmentId)
      .maybeSingle();
    if (appointmentError) return NextResponse.json({ error: appointmentError.message }, { status: 500 });
    if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

    const { data: lineup } = await admin
      .from("lineup_entries")
      .select("content,updated_at")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    const shortId = extractShortId(appointment.shiftreporter_link);
    if (!shortId) {
      return NextResponse.json({
        data: {
          lineup: String(lineup?.content || ""),
          lineupUpdatedAt: lineup?.updated_at || null,
          stowplan: "",
          cargoThisShift: "",
          runningSof: "",
        },
      });
    }

    const { data: vessel, error: vesselError } = await admin
      .from("vessels")
      .select("id,name")
      .eq("short_id", shortId)
      .maybeSingle();
    if (vesselError) return NextResponse.json({ error: vesselError.message }, { status: 500 });
    if (!vessel) {
      return NextResponse.json({
        data: {
          lineup: String(lineup?.content || ""),
          lineupUpdatedAt: lineup?.updated_at || null,
          stowplan: "",
          cargoThisShift: "",
          runningSof: "",
        },
      });
    }

    const [{ data: stowRows }, { data: shiftRows }] = await Promise.all([
      admin
        .from("stow_plans")
        .select("hold,grade,total_mt,draft_fwd,draft_mean,draft_aft")
        .eq("vessel_id", vessel.id)
        .order("hold", { ascending: true }),
      admin
        .from("shift_reports")
        .select("id,shift_start,shift_end")
        .eq("vessel_id", vessel.id)
        .order("shift_start", { ascending: false }),
    ]);

    const stowPlanRows = (stowRows || []).filter((row: any) => !DRAFT_META_GRADE.has(String(row?.grade || "")));
    const firstStow = stowPlanRows[0];
    const stowLines = stowPlanRows.map((row: any) => `H${row.hold} ${row.grade}: ${Number(row.total_mt || 0).toLocaleString()} MT`);
    const stowplan = [
      stowLines.length ? `Stowplan:\n${stowLines.join("\n")}` : "Stowplan:\n-",
      firstStow
        ? `Drafts FWD/MEAN/AFT: ${Number(firstStow.draft_fwd || 0).toFixed(2)} / ${Number(firstStow.draft_mean || 0).toFixed(2)} / ${Number(firstStow.draft_aft || 0).toFixed(2)}`
        : "Drafts FWD/MEAN/AFT: -",
    ].join("\n");

    const latestShift = (shiftRows || [])[0];
    let cargoThisShift = "";
    if (latestShift?.id) {
      const { data: lines } = await admin
        .from("shift_lines")
        .select("hold,grade,this_shift_mt")
        .eq("shift_id", latestShift.id);
      const total = (lines || []).reduce((sum: number, row: any) => sum + Number(row.this_shift_mt || 0), 0);
      const topLines = (lines || [])
        .slice(0, 12)
        .map((row: any) => `H${row.hold} ${row.grade}: ${Number(row.this_shift_mt || 0).toLocaleString()} MT`);
      cargoThisShift = [
        `Latest Shift: ${formatDateTimeShort(latestShift.shift_start)} -> ${formatDateTimeShort(latestShift.shift_end)}`,
        `Total This Shift: ${total.toLocaleString()} MT`,
        topLines.length ? topLines.join("\n") : "-",
      ].join("\n");
    }

    const shiftIds = (shiftRows || []).map((row: any) => row.id).filter(Boolean);
    let runningSof = "";
    if (shiftIds.length) {
      const { data: delays } = await admin
        .from("shift_delays")
        .select("from_time,to_time,reason")
        .in("shift_id", shiftIds)
        .order("from_time", { ascending: true });
      runningSof = (delays || [])
        .slice(-30)
        .map((row: any) => `${formatDateTimeShort(row.from_time)} -> ${formatDateTimeShort(row.to_time)} | ${String(row.reason || "").trim()}`)
        .join("\n");
    }

    return NextResponse.json({
      data: {
        lineup: String(lineup?.content || ""),
        lineupUpdatedAt: lineup?.updated_at || null,
        stowplan,
        cargoThisShift,
        runningSof,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch DPR snapshot" },
      { status: 500 },
    );
  }
}

