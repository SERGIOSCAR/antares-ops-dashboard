import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const appointmentId = searchParams.get("appointment_id");
    const tool = searchParams.get("tool");

    if (!appointmentId || !tool) {
      return NextResponse.json(
        { error: "appointment_id and tool are required" },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("appointment_workspace_notes")
      .select("appointment_id,tool,content,updated_at")
      .eq("appointment_id", appointmentId)
      .eq("tool", tool)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? null });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workspace note" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      appointment_id?: string;
      tool?: string;
      content?: string;
    };

    if (!body?.appointment_id || !body?.tool) {
      return NextResponse.json(
        { error: "appointment_id and tool are required" },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("appointment_workspace_notes")
      .upsert(
        {
          appointment_id: body.appointment_id,
          tool: body.tool,
          content: body.content ?? "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "appointment_id,tool" },
      )
      .select("appointment_id,tool,content,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save workspace note" },
      { status: 500 },
    );
  }
}

