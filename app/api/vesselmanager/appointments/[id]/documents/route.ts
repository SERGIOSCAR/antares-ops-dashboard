import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppointmentDocumentType } from "@/lib/vesselmanager/types";

const bucket = "appointment-documents";
const validTypes: AppointmentDocumentType[] = ["SOF", "ITC", "SHIP_PART", "OTHER_DOX"];

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("appointment_documents")
      .select("id,appointment_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size,uploaded_by,created_at")
      .eq("appointment_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load appointment documents" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("document_type") || "").trim().toUpperCase() as AppointmentDocumentType;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!validTypes.includes(documentType)) {
      return NextResponse.json({ error: "document_type is invalid" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const server = await supabaseServer();
    const {
      data: { user },
    } = await server.auth.getUser();

    const extSafeName = sanitizeFileName(file.name || "document");
    const storagePath = `${id}/${documentType}/${Date.now()}-${extSafeName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const upload = await admin.storage.from(bucket).upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message }, { status: 500 });
    }

    const insert = await admin
      .from("appointment_documents")
      .insert({
        appointment_id: id,
        document_type: documentType,
        file_name: file.name,
        storage_bucket: bucket,
        storage_path: storagePath,
        mime_type: file.type || null,
        file_size: file.size || null,
        uploaded_by: user?.id || null,
      })
      .select("id,appointment_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size,uploaded_by,created_at")
      .single();

    if (insert.error) {
      await admin.storage.from(bucket).remove([storagePath]);
      return NextResponse.json({ error: insert.error.message }, { status: 500 });
    }

    return NextResponse.json({ data: insert.data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload appointment document" },
      { status: 500 },
    );
  }
}
