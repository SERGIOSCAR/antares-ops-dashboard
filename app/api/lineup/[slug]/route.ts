import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await supabaseServer();

    const subAgentRes = await supabase
      .from("sub_agents")
      .select("id,name,slug,is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (subAgentRes.error) return NextResponse.json({ error: subAgentRes.error.message }, { status: 500 });
    if (!subAgentRes.data) return NextResponse.json({ error: "Sub-agent not found" }, { status: 404 });

    const apptRes = await supabase
      .from("appointments")
      .select("id,vessel_name,port,terminal,cargo_operation,cargo_grade,cargo_qty,status,created_at")
      .eq("sub_agent_id", subAgentRes.data.id)
      .neq("status", "SAILED")
      .neq("status", "CLOSED")
      .order("created_at", { ascending: false });

    if (apptRes.error) return NextResponse.json({ error: apptRes.error.message }, { status: 500 });
    const appointments = apptRes.data ?? [];
    const ids = appointments.map((a) => a.id);

    const lineupRes = ids.length
      ? await supabase
          .from("lineup_entries")
          .select("id,appointment_id,content,version,updated_at,updated_by,updated_by_type,source")
          .in("appointment_id", ids)
      : { data: [], error: null };

    if (lineupRes.error) return NextResponse.json({ error: lineupRes.error.message }, { status: 500 });

    const lineupMap = new Map(
      (lineupRes.data ?? []).map((x) => [x.appointment_id, x]),
    );

    return NextResponse.json({
      data: {
        subAgent: subAgentRes.data,
        appointments: appointments.map((a) => ({
          ...a,
          lineup: lineupMap.get(a.id) ?? null,
        })),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch lineup page data" },
      { status: 500 },
    );
  }
}
