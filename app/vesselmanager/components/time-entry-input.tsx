"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  error?: string;
  disabled?: boolean;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periods = ["EAM", "AM", "NOON", "EPM", "PM", "LPM"];

function parseFromValue(value: string) {
  const m = value.trim().match(/^(\d{1,2})([A-Za-z]{3})\s+([0-2]?\d(?::[0-5]\d)?|EAM|AM|NOON|PM|EPM|LPM)$/);
  if (!m) return { dateKey: "", hour: "", period: "" };
  const token = m[3].toUpperCase();
  return {
    dateKey: `${m[1].padStart(2, "0")}${m[2][0]?.toUpperCase() || ""}${m[2].slice(1, 3).toLowerCase()}`,
    hour: /^\d/.test(token) ? token.split(":")[0].padStart(2, "0") : "",
    period: periods.includes(token) ? token : "",
  };
}

export default function TimeEntryInput({ value, onChange, onSubmit, onCancel, error, disabled }: Props) {
  const parsed = useMemo(() => parseFromValue(value), [value]);
  const [dateKey, setDateKey] = useState(parsed.dateKey);
  const [hour, setHour] = useState(parsed.hour);
  const [period, setPeriod] = useState(parsed.period);

  useEffect(() => {
    setDateKey(parsed.dateKey);
    setHour(parsed.hour);
    setPeriod(parsed.period);
  }, [parsed.dateKey, parsed.hour, parsed.period]);

  const emitHour = (nextDate: string, nextHour: string) => {
    if (!nextDate || !nextHour) return;
    onChange(`${nextDate} ${nextHour}`);
  };

  const emitPeriod = (nextDate: string, nextPeriod: string) => {
    if (!nextDate || !nextPeriod) return;
    onChange(`${nextDate} ${nextPeriod}`);
  };

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
        placeholder="15May 07"
        disabled={disabled}
      />
      <div className="grid grid-cols-3 gap-1">
        <select
          value={dateKey}
          onChange={(e) => {
            const v = e.target.value;
            setDateKey(v);
            if (hour) emitHour(v, hour);
            if (!hour && period) emitPeriod(v, period);
          }}
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100"
        >
          <option value="">Date</option>
          {months.flatMap((m) =>
            Array.from({ length: 31 }, (_, i) => {
              const d = String(i + 1).padStart(2, "0");
              const v = `${d}${m}`;
              return (
                <option key={v} value={v}>
                  {v}
                </option>
              );
            }),
          )}
        </select>
        <select
          value={hour}
          onChange={(e) => {
            const v = e.target.value;
            setHour(v);
            if (v) setPeriod("");
            emitHour(dateKey, v);
          }}
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100"
        >
          <option value="">Hour</option>
          {Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, "0")).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => {
            const v = e.target.value;
            setPeriod(v);
            if (v) setHour("");
            emitPeriod(dateKey, v);
          }}
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100"
        >
          <option value="">Period</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
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
      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}
    </div>
  );
}
