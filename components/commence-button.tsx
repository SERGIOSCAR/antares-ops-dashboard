"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function CommenceButton({
  vesselId,
  initialRecipients = [],
  reviseHref,
}: {
  vesselId: string;
  initialRecipients?: string[];
  reviseHref?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCommence = async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Unauthorized: please log in again");
      }

      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error || `Failed to commence operations (${res.status})`);
      }

      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to commence operations";
      alert(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <div className="mb-2 text-sm font-medium text-slate-200">Primary Recipients</div>
        <div className="text-sm text-slate-300">
          {initialRecipients.length ? initialRecipients.join(", ") : "No primary recipients configured."}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleCommence}
          disabled={loading}
          className="h-10 rounded-md bg-zinc-900 px-6 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Commencing..." : "Confirm Commence"}
        </button>
        {reviseHref ? (
          <button
            type="button"
            onClick={() => router.push(reviseHref)}
            className="h-10 rounded-md border border-slate-600 px-6 font-medium text-slate-100 hover:bg-slate-800"
          >
            Return to Revise
          </button>
        ) : null}
      </div>
    </div>
  );
}
