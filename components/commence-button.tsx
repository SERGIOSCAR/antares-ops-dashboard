"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function CommenceButton({ vesselId }: { vesselId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCommence = async () => {
    if (!confirm("Commence operations for this vessel? This action marks the start of cargo operations.")) {
      return;
    }

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
        const message =
          errorData?.error ||
          `Failed to commence operations (${res.status})`;
        throw new Error(message);
      }

      alert("✅ Operations commenced successfully!");
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to commence operations";
      alert(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCommence}
      disabled={loading}
      className="h-10 rounded-md bg-zinc-900 text-white font-medium px-6 hover:bg-zinc-800 disabled:opacity-50"
    >
      {loading ? "Commencing..." : "Commence Operations"}
    </button>
  );
}
