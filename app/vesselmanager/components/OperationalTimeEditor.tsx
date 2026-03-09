import { useState } from "react";

type Props = {
  value: string;
  onEstimate: (value: string) => void;
  onActual: (value: string) => void;
  onCancel: () => void;
};

export default function OperationalTimeEditor({
  value,
  onEstimate,
  onActual,
  onCancel,
}: Props) {
  const [text, setText] = useState(value);

  const hasExplicitHour = /\d{1,2}:\d{2}|\d{1,2}H/i.test(text);

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
      />

      <div className="flex gap-2">
        <button
          onClick={() => onEstimate(text)}
          className="rounded bg-blue-600 px-2 py-1 text-xs"
        >
          Estimate
        </button>

        {hasExplicitHour && (
          <button
            onClick={() => onActual(text)}
            className="rounded bg-emerald-600 px-2 py-1 text-xs"
          >
            Actual
          </button>
        )}
      </div>
    </div>
  );
}
