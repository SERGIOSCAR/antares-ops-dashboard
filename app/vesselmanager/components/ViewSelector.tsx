"use client";

export type View = "board" | "my" | "followed" | "inport" | "active" | "sailed" | "tdytomo";

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
  { id: "tdytomo", label: "Tdy & Tomo" },
  { id: "board", label: "Summary" },
];

export default function ViewSelector({ current, onChange, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {views.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={`rounded px-3 py-1 text-sm ${
            current === v.id
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          {v.label} ({counts[v.id]})
        </button>
      ))}
    </div>
  );
}
