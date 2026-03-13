"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppointmentDocument, AppointmentDocumentType } from "@/lib/vesselmanager/types";

type Props = {
  appointmentId: string;
};

const docTypes: Array<{ key: AppointmentDocumentType; label: string }> = [
  { key: "SOF", label: "SOF" },
  { key: "SHIP_PART", label: "Ship's Particulars" },
  { key: "ITC", label: "ITC" },
  { key: "OTHER_DOX", label: "Other Dox" },
];

export default function AppointmentDocumentsPanel({ appointmentId }: Props) {
  const [documents, setDocuments] = useState<AppointmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<AppointmentDocumentType | null>(null);
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    return docTypes.map((type) => ({
      ...type,
      rows: documents.filter((doc) => doc.document_type === type.key),
    }));
  }, [documents]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}/documents`, { cache: "no-store" });
        const json = (await res.json()) as { data?: AppointmentDocument[]; error?: string };
        if (!active) return;
        if (!res.ok) throw new Error(json.error || "Failed to load documents");
        setDocuments(json.data || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load documents");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [appointmentId]);

  const uploadDocument = async (documentType: AppointmentDocumentType, file: File | null) => {
    if (!file) return;
    setSavingType(documentType);
    setError("");
    try {
      const formData = new FormData();
      formData.append("document_type", documentType);
      formData.append("file", file);

      const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}/documents`, {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { data?: AppointmentDocument; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to upload document");
      setDocuments((current) => [json.data!, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Operational Documents</h2>
          <p className="mt-1 text-sm text-slate-400">Upload documents for accounting read-only review later.</p>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {grouped.map((group) => (
          <div key={group.key} className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{group.label}</h3>
              <label className="cursor-pointer rounded border border-slate-600 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800">
                {savingType === group.key ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  className="hidden"
                  disabled={savingType !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    void uploadDocument(group.key, file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {loading ? (
              <div className="text-sm text-slate-400">Loading...</div>
            ) : group.rows.length ? (
              <div className="space-y-2">
                {group.rows.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 rounded border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-slate-100">{doc.file_name}</div>
                      <div className="text-xs text-slate-400">{new Date(doc.created_at).toLocaleString()}</div>
                    </div>
                    <a
                      href={`/api/vesselmanager/documents/${doc.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400">No files uploaded.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
