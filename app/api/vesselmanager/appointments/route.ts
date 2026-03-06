import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { CreateAppointmentInput } from "@/lib/vesselmanager/types";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("appointments")
      .select("id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,status,created_by,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch appointments" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateAppointmentInput;

    if (!body?.vessel_name || !body?.role || !body?.appointed_by) {
      return NextResponse.json(
        { error: "vessel_name, role and appointed_by are required" },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();

    const payload = {
      vessel_name: body.vessel_name,
      role: body.role,
      appointed_by: body.appointed_by,
      port: body.port ?? null,
      terminal: body.terminal ?? null,
      cargo_operation: body.cargo_operation ?? null,
      cargo_grade: body.cargo_grade ?? null,
      cargo_qty: body.cargo_qty ?? null,
      status: body.status ?? "PROSPECT",
    };

    const { data, error } = await supabase
      .from("appointments")
      .insert(payload)
      .select("id,vessel_name,role,appointed_by,port,terminal,cargo_operation,cargo_grade,cargo_qty,status,created_by,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create appointment" },
      { status: 500 },
    );
  }
}
