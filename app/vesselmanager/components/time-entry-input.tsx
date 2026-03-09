"use client";

import { parseOperationalInput } from "@/lib/vesselmanager/parse-operational-time";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  error?: string;
  disabled?: boolean;
};

export default function TimeEntryInput({ value, onChange, onSubmit, onCancel, error, disabled }: Props) {
  const inlineValid = value.trim() === "" || !!parseOperationalInput(value);

  return (
    <div className="space-y-1 rounded-md border border-slate-600 bg-slate-900 p-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") onCancel();
        }}
        className="w-full rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100"
        placeholder="15May AM"
        disabled={disabled}
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-600 px-1.5 py-0.5 text-[11px] text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded border border-blue-500 px-1.5 py-0.5 text-[11px] text-blue-300"
          disabled={disabled}
        >
          Save
        </button>
      </div>
      {!inlineValid ? (
        <div className="text-[11px] text-slate-300">Use DDMMM HH, DDMMM HH:MM, DDMMM AM/PM/EAM/EPM/NOON/LPM</div>
      ) : null}
      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}
    </div>
  );
}
