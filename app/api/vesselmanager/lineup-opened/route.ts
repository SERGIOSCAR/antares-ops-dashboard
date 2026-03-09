import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { appointment_id?: string };
    if (!body?.appointment_id) {
      return NextResponse.json({ error: "appointment_id is required" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("appointments")
      .update({ lineup_opened_at: new Date().toISOString() })
      .eq("id", body.appointment_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark lineup opened" },
      { status: 500 },
    );
  }
}

