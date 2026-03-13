import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function sanitizeDate(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const raw = String(input).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function sanitizeRoe(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  return value;
}

function sanitizeInteger(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  const value = Number(input);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      accounting_reference?: string | null;
      roe?: number | string | null;
      pda_due_days_override?: number | string | null;
      pda_sent_on?: string | null;
      pda_not_required?: boolean;
      ada_attention_days_override?: number | string | null;
      ada_urgent_days_override?: number | string | null;
      ada_created_on?: string | null;
      ada_sent_on?: string | null;
      fda_attention_days_override?: number | string | null;
      fda_urgent_days_override?: number | string | null;
      fda_created_on?: string | null;
      fda_sent_on?: string | null;
    };

    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const exists = await supabase.from("appointments").select("id").eq("id", id).maybeSingle();
    if (exists.error) {
      return NextResponse.json({ error: exists.error.message }, { status: 500 });
    }
    if (!exists.data) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const result = await supabase.from("appointment_accounting").upsert(
      {
        appointment_id: id,
        accounting_reference: body.accounting_reference?.trim() || null,
        roe: sanitizeRoe(body.roe),
        pda_due_days_override: sanitizeInteger(body.pda_due_days_override),
        pda_sent_on: sanitizeDate(body.pda_sent_on),
        pda_not_required: !!body.pda_not_required,
        ada_attention_days_override: sanitizeInteger(body.ada_attention_days_override),
        ada_urgent_days_override: sanitizeInteger(body.ada_urgent_days_override),
        ada_created_on: sanitizeDate(body.ada_created_on),
        ada_sent_on: sanitizeDate(body.ada_sent_on),
        fda_attention_days_override: sanitizeInteger(body.fda_attention_days_override),
        fda_urgent_days_override: sanitizeInteger(body.fda_urgent_days_override),
        fda_created_on: sanitizeDate(body.fda_created_on),
        fda_sent_on: sanitizeDate(body.fda_sent_on),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "appointment_id" },
    );

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update accounting fields" },
      { status: 500 },
    );
  }
}
