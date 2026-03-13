"use client";

export type View = "board" | "my" | "followed" | "inport" | "active" | "sailed" | "checklist_pending" | "tdytomo";

type Props = {
  current: View;
  onChange: (view: View) => void;
  counts: Record<View, number>;
};

const views: Array<{ id: View; label: string }> = [
  { id: "my", label: "My Vessels" },
  { id: "followed", label: "Followed" },
  { id: "inport", label: "In Port" },
  { id: "active", label: "All Active" },
  { id: "sailed", label: "All Sailed" },
  { id: "checklist_pending", label: "Pending Checklist" },
  { id: "tdytomo", label: "Tdy & Tomo" },
  { id: "board", label: "Summary" },
];

export default function ViewSelector({ current, onChange, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {views.map((v) => {
        const isSummary = v.id === "board";
        const className =
          current === v.id
            ? isSummary
              ? "bg-blue-600 text-yellow-300"
              : "bg-blue-600 text-white"
            : isSummary
              ? "bg-slate-800 text-yellow-300"
              : "bg-slate-800 text-slate-300";

        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className={`rounded px-3 py-1 text-sm ${className}`}
          >
            {v.label} ({counts[v.id]})
          </button>
        );
      })}
    </div>
  );
}
