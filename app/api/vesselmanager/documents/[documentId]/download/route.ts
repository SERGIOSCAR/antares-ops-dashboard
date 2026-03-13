import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const admin = supabaseAdmin();

    const doc = await admin
      .from("appointment_documents")
      .select("storage_bucket,storage_path")
      .eq("id", documentId)
      .single();

    if (doc.error || !doc.data) {
      return NextResponse.json({ error: doc.error?.message || "Document not found" }, { status: 404 });
    }

    const signed = await admin.storage
      .from(doc.data.storage_bucket)
      .createSignedUrl(doc.data.storage_path, 60 * 10);

    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json({ error: signed.error?.message || "Failed to create document link" }, { status: 500 });
    }

    return NextResponse.redirect(signed.data.signedUrl);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to open appointment document" },
      { status: 500 },
    );
  }
}
