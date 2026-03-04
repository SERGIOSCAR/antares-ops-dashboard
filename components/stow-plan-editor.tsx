"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

type StowPlanEditorProps = {
  vesselId: string;
  holds: number;
  grades: string[];
  currentPlan: Array<{
    hold: number;
    grade: string;
    total_mt: number;
    condition?: string;
    draft_fwd?: number | null;
    draft_mean?: number | null;
    draft_aft?: number | null;
  }>;
  initialDrafts?: { fwd: number; mean: number; aft: number };
};

const CONDITION_OPTIONS = ["", "empty", "slack", "full"];

export default function StowPlanEditor({
  vesselId,
  holds,
  grades,
  currentPlan,
  initialDrafts,
}: StowPlanEditorProps) {
  type DraftKey = "fwd" | "mean" | "aft";

  const parseDraft = (value: string) => {
    const normalized = String(value ?? "").replace(",", ".").trim();
    const num = Number.parseFloat(normalized);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
  };

  const normalizeDraftInput = (value: string) => {
    const fixed = parseDraft(value).toFixed(2);
    const [whole, fraction] = fixed.split(".");
    return `${whole.padStart(2, "0")}.${fraction || "00"}`;
  };

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Record<number, { grade: string; total_mt: number; condition: string }>>(
    currentPlan.reduce((acc, item) => {
      acc[item.hold] = { grade: item.grade, total_mt: item.total_mt, condition: item.condition || "" };
      return acc;
    }, {} as Record<number, { grade: string; total_mt: number; condition: string }>)
  );
  const [draftInputs, setDraftInputs] = useState<{ fwd: string; mean: string; aft: string }>(() => {
    if (initialDrafts) {
      return {
        fwd: normalizeDraftInput(String(initialDrafts.fwd ?? "0")),
        mean: normalizeDraftInput(String(initialDrafts.mean ?? "0")),
        aft: normalizeDraftInput(String(initialDrafts.aft ?? "0")),
      };
    }

    const firstRow = currentPlan[0];
    return {
      fwd: normalizeDraftInput(String(Number(firstRow?.draft_fwd) || 0)),
      mean: normalizeDraftInput(String(Number(firstRow?.draft_mean) || 0)),
      aft: normalizeDraftInput(String(Number(firstRow?.draft_aft) || 0)),
    };
  });

  const draftNumbers = {
    fwd: parseDraft(draftInputs.fwd),
    mean: parseDraft(draftInputs.mean),
    aft: parseDraft(draftInputs.aft),
  };
  const fieldClass =
    "w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  const router = useRouter();

  const handleDraftChange = (key: DraftKey, raw: string) => {
    const cleaned = raw.replace(/,/g, ".");
    if (cleaned === "") {
      setDraftInputs((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    if (!/^\d{0,2}(\.\d{0,2})?$/.test(cleaned)) return;
    setDraftInputs((prev) => ({ ...prev, [key]: cleaned }));
  };

  const handleDraftBlur = (key: DraftKey) => {
    setDraftInputs((prev) => ({
      ...prev,
      [key]: normalizeDraftInput(prev[key]),
    }));
  };

  const updateHold = (
    hold: number,
    updates: Partial<{ grade: string; total_mt: number; condition: string }>
  ) => {
    setPlan(prev => ({
      ...prev,
      [hold]: {
        grade: prev[hold]?.grade ?? grades[0] ?? "",
        total_mt: prev[hold]?.total_mt ?? 0,
        condition: prev[hold]?.condition ?? "",
        ...updates,
      }
    }));
  };

  const calculateTotals = () => {
    const totals: Record<string, number> = {};
    Object.values(plan).forEach(({ grade, total_mt }) => {
      totals[grade] = (totals[grade] || 0) + total_mt;
    });
    return totals;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const planData = Object.entries(plan).map(([hold, data]) => ({
        hold: Number(hold),
        grade: data.grade,
        totalMT: data.total_mt,
        condition: data.condition,
      }));

      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/stowplan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: planData,
          drafts: {
            fwd: draftNumbers.fwd,
            mean: draftNumbers.mean,
            aft: draftNumbers.aft,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to update stow plan");

      alert("✅ Stow plan updated successfully!");
      setEditing(false);
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update stow plan";
      alert(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();
  const grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Stow Plan</h2>
          <p className="text-sm text-zinc-600">
            Total: {grandTotal.toFixed(3)} MT
            {Object.entries(totals).map(([grade, mt]) => (
              <span key={grade} className="ml-3 text-zinc-500">
                {grade}: {mt.toFixed(3)} MT
              </span>
            ))}
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="h-9 rounded-md bg-zinc-900 text-white font-medium px-4 text-sm hover:bg-zinc-800"
          >
            Edit Stow Plan
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-1">Draft FWD (m)</label>
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={draftInputs.fwd}
              onChange={(e) => handleDraftChange("fwd", e.target.value)}
              onBlur={() => handleDraftBlur("fwd")}
              className={fieldClass}
            />
          ) : (
            <div className="h-9 rounded border bg-zinc-50 px-2 text-sm flex items-center">
              {draftNumbers.fwd.toFixed(2)}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-1">Draft Mean (m)</label>
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={draftInputs.mean}
              onChange={(e) => handleDraftChange("mean", e.target.value)}
              onBlur={() => handleDraftBlur("mean")}
              className={fieldClass}
            />
          ) : (
            <div className="h-9 rounded border bg-zinc-50 px-2 text-sm flex items-center">
              {draftNumbers.mean.toFixed(2)}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-1">Draft AFT (m)</label>
          {editing ? (
            <input
              type="text"
              inputMode="decimal"
              value={draftInputs.aft}
              onChange={(e) => handleDraftChange("aft", e.target.value)}
              onBlur={() => handleDraftBlur("aft")}
              className={fieldClass}
            />
          ) : (
            <div className="h-9 rounded border bg-zinc-50 px-2 text-sm flex items-center">
              {draftNumbers.aft.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-zinc-50">
                  <th className="p-2 text-left font-medium">Hold</th>
                  <th className="p-2 text-left font-medium">Grade</th>
                  <th className="p-2 text-left font-medium">Total MT</th>
                  <th className="p-2 text-left font-medium">Condition</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: holds }).map((_, i) => {
                  const hold = i + 1;
                  const holdData = plan[hold] || { grade: grades[0] || "", total_mt: 0, condition: "" };
                  return (
                    <tr key={hold} className="border-b">
                      <td className="p-2 font-medium">Hold {hold}</td>
                      <td className="p-2">
                        <select
                          value={holdData.grade}
                          onChange={(e) => updateHold(hold, { grade: e.target.value })}
                          className={fieldClass}
                        >
                          {grades.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.001"
                          value={holdData.total_mt}
                          onChange={(e) => updateHold(hold, { total_mt: Number(e.target.value) })}
                          className={fieldClass}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={holdData.condition}
                          onChange={(e) => updateHold(hold, { condition: e.target.value })}
                          className={fieldClass}
                        >
                          <option value="">-</option>
                          {CONDITION_OPTIONS.filter(Boolean).map((condition) => (
                            <option key={condition} value={condition}>
                              {condition}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="h-10 rounded-md bg-zinc-900 text-white font-medium px-6 hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Stow Plan"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-10 rounded-md border border-zinc-300 text-zinc-700 font-medium px-6 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-zinc-50">
                <th className="p-2 text-left font-medium">Hold</th>
                <th className="p-2 text-left font-medium">Grade</th>
                <th className="p-2 text-left font-medium">Total MT</th>
                <th className="p-2 text-left font-medium">Condition</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: holds }).map((_, i) => {
                const hold = i + 1;
                const holdData = plan[hold] || { grade: "-", total_mt: 0, condition: "" };
                return (
                  <tr key={hold} className="border-b">
                    <td className="p-2 font-medium">Hold {hold}</td>
                    <td className="p-2">{holdData.grade}</td>
                    <td className="p-2">{holdData.total_mt.toFixed(3)} MT</td>
                    <td className="p-2">{holdData.condition || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

