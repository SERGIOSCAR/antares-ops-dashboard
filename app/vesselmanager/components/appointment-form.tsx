"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, AppointmentRecipient } from "@/lib/vesselmanager/types";

type Props = {
  mode: "create" | "edit";
  appointmentId?: string;
  initialAppointment?: Partial<Appointment>;
  initialRecipients?: AppointmentRecipient[];
};

type RecipientCategory = AppointmentRecipient["category"];

const recipientCategories: { value: RecipientCategory; label: string }[] = [
  { value: "service_provider", label: "Service Providers" },
  { value: "chart_agent_terminal_impoexpo_other", label: "Chart Agents / Terminal / ImpoExpo / Others" },
  { value: "charterer", label: "Charterers" },
  { value: "principal", label: "Principals" },
  { value: "additional_party", label: "Additional Parties" },
];

const appointedForOptions = [
  "OPA",
  "CHARTERER'S AGENT",
  "HUSBANDRY",
  "HOLDS",
  "OTHER (SPECIFIED BELOW)",
];

const card = "rounded-xl border border-slate-700 bg-slate-800 p-5";
const label = "text-xs font-medium uppercase tracking-wide text-slate-300";
const input = "mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100";

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function blankRecipient(): AppointmentRecipient {
  return {
    category: "additional_party",
    name: null,
    email: "",
    is_onetimer: false,
  };
}

export default function AppointmentForm({
  mode,
  appointmentId,
  initialAppointment,
  initialRecipients,
}: Props) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const [form, setForm] = useState({
    vessel_name: initialAppointment?.vessel_name ?? "",
    appointment_datetime: toLocalDateTime(initialAppointment?.appointment_datetime),
    port: initialAppointment?.port ?? "",
    terminal: initialAppointment?.terminal ?? "",
    cargo_operation: initialAppointment?.cargo_operation ?? "",
    cargo_grade: initialAppointment?.cargo_grade ?? "",
    cargo_qty: initialAppointment?.cargo_qty?.toString() ?? "",
    holds: initialAppointment?.holds?.toString() ?? "",
    role: initialAppointment?.role ?? "",
    appointed_by: initialAppointment?.appointed_by ?? "",
    charterer_agent: initialAppointment?.charterer_agent ?? "",
    thanks_to: initialAppointment?.thanks_to ?? "",
    other_agents: initialAppointment?.other_agents ?? "",
    other_agents_role: initialAppointment?.other_agents_role ?? "",
    notify_eta_suppliers:
      initialAppointment?.notify_eta_suppliers === null || initialAppointment?.notify_eta_suppliers === undefined
        ? true
        : !!initialAppointment.notify_eta_suppliers,
    notify_eta_agents_terminals:
      initialAppointment?.notify_eta_agents_terminals === null ||
      initialAppointment?.notify_eta_agents_terminals === undefined
        ? true
        : !!initialAppointment.notify_eta_agents_terminals,
    notify_none: initialAppointment?.notify_none ?? false,
    needs_daily_prospect:
      initialAppointment?.needs_daily_prospect === null || initialAppointment?.needs_daily_prospect === undefined
        ? true
        : !!initialAppointment.needs_daily_prospect,
  });

  const [recipients, setRecipients] = useState<AppointmentRecipient[]>(
    initialRecipients?.length ? initialRecipients : [blankRecipient()],
  );

  const requiresAlerts = useMemo(() => {
    if (form.notify_none) return false;
    return form.notify_eta_suppliers || form.notify_eta_agents_terminals || form.needs_daily_prospect;
  }, [form]);

  const updateField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateRecipient = (index: number, patch: Partial<AppointmentRecipient>) => {
    setRecipients((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addRecipient = () => setRecipients((prev) => [...prev, blankRecipient()]);
  const removeRecipient = (index: number) => setRecipients((prev) => prev.filter((_, i) => i !== index));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.vessel_name.trim()) {
      setError("Vessel name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        vessel_name: form.vessel_name.trim(),
        appointment_datetime: form.appointment_datetime || null,
        port: form.port || null,
        terminal: form.terminal || null,
        cargo_operation: form.cargo_operation || null,
        cargo_grade: form.cargo_grade || null,
        cargo_qty: form.cargo_qty ? Number(form.cargo_qty) : null,
        holds: form.holds ? Number(form.holds) : null,
        role: form.role || null,
        appointed_by: form.appointed_by || null,
        charterer_agent: form.charterer_agent || null,
        thanks_to: form.thanks_to || null,
        other_agents: form.other_agents || null,
        other_agents_role: form.other_agents_role || null,
        notify_eta_suppliers: form.notify_none ? false : form.notify_eta_suppliers,
        notify_eta_agents_terminals: form.notify_none ? false : form.notify_eta_agents_terminals,
        notify_none: form.notify_none,
        needs_daily_prospect: form.notify_none ? false : form.needs_daily_prospect,
        recipients: recipients
          .filter((r) => r.email?.trim())
          .map((r) => ({
            category: r.category,
            name: r.name || null,
            email: r.email.trim(),
            is_onetimer: !!r.is_onetimer,
          })),
      };

      const url = mode === "create" ? "/api/vesselmanager/appointments" : `/api/vesselmanager/appointments/${appointmentId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to save appointment");
      }

      router.push("/vesselmanager");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save appointment");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className={card}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Appointment Core</h2>
          <div className="text-right text-xs text-slate-400">
            <div className="uppercase tracking-wide">Timestamp</div>
            <div className="text-slate-300">
              {mode === "create"
                ? "Auto-generated on create"
                : formatTimestamp(initialAppointment?.appointment_datetime || initialAppointment?.created_at) || "Auto-generated"}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <label className={label}>
              Vessel Name *
              <input className={input} value={form.vessel_name} onChange={(e) => updateField("vessel_name", e.target.value)} />
            </label>
            <label className={label}>
              Port
              <input className={input} value={form.port} onChange={(e) => updateField("port", e.target.value)} />
            </label>
            <label className={label}>
              Terminal
              <input className={input} value={form.terminal} onChange={(e) => updateField("terminal", e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <label className={label}>
              Type of Operation
              <select className={input} value={form.cargo_operation} onChange={(e) => updateField("cargo_operation", e.target.value)}>
                <option value="">Select</option>
                <option value="LOAD">LOAD</option>
                <option value="DISCH">DISCH</option>
              </select>
            </label>
            <label className={label}>
              Type of Cargo
              <input className={input} value={form.cargo_grade} onChange={(e) => updateField("cargo_grade", e.target.value)} />
            </label>
            <label className={label}>
              Cargo Qty
              <input type="number" className={input} value={form.cargo_qty} onChange={(e) => updateField("cargo_qty", e.target.value)} />
            </label>
            <label className={label}>
              Holds Qty
              <input type="number" className={input} value={form.holds} onChange={(e) => updateField("holds", e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <label className={label}>
              Appointed By
              <input className={input} value={form.appointed_by} onChange={(e) => updateField("appointed_by", e.target.value)} placeholder="Your agency / principal" />
            </label>
            <label className={label}>
              Appointed For (Our Role)
              <select className={input} value={form.role} onChange={(e) => updateField("role", e.target.value)}>
                <option value="">Select</option>
                {appointedForOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {form.role && !appointedForOptions.includes(form.role) ? (
                  <option value={form.role}>{form.role}</option>
                ) : null}
              </select>
            </label>
            <label className={label}>
              Charterer&apos;s Agent
              <input className={input} value={form.charterer_agent} onChange={(e) => updateField("charterer_agent", e.target.value)} />
            </label>
            <label className={label}>
              Thanks To
              <input
                className={input}
                value={form.thanks_to}
                onChange={(e) => updateField("thanks_to", e.target.value)}
                placeholder="Indicated by (optional)"
              />
            </label>
          </div>

          <label className={label}>
            Other Appointments or Other Agents and Their Roles
            <textarea
              rows={3}
              className={`${input} resize-y`}
              value={form.other_agents}
              onChange={(e) => updateField("other_agents", e.target.value)}
              placeholder="Add any other appointments, agents and roles here"
            />
          </label>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Alert & Reporting Rules</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.notify_eta_suppliers}
              onChange={(e) => updateField("notify_eta_suppliers", e.target.checked)}
              disabled={form.notify_none}
            />
            ETA notices to suppliers
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.notify_eta_agents_terminals}
              onChange={(e) => updateField("notify_eta_agents_terminals", e.target.checked)}
              disabled={form.notify_none}
            />
            ETA notices to agents/terminals
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.needs_daily_prospect}
              onChange={(e) => updateField("needs_daily_prospect", e.target.checked)}
              disabled={form.notify_none}
            />
            Daily prospect required
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.notify_none}
              onChange={(e) => {
                const checked = e.target.checked;
                updateField("notify_none", checked);
                if (checked) {
                  updateField("notify_eta_suppliers", false);
                  updateField("notify_eta_agents_terminals", false);
                  updateField("needs_daily_prospect", false);
                }
              }}
            />
            None (disable notices and warning alerts)
          </label>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Alert outcome preview: {requiresAlerts ? "Warning icons enabled by schedule." : "No warning alerts (can map to soft violet-cross state)."}
        </p>
      </div>

      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Mailing Layers & Additional Parties</h2>
          <button type="button" onClick={addRecipient} className="rounded-md bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600">
            Add Recipient
          </button>
        </div>

        <div className="space-y-3">
          {recipients.map((recipient, index) => (
            <div key={`recipient-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-700 bg-slate-900 p-3 md:grid-cols-[220px_1fr_1fr_110px_90px]">
              <select
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                value={recipient.category}
                onChange={(e) => updateRecipient(index, { category: e.target.value as RecipientCategory })}
              >
                {recipientCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                placeholder="Name"
                value={recipient.name ?? ""}
                onChange={(e) => updateRecipient(index, { name: e.target.value })}
              />
              <input
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                placeholder="Email"
                value={recipient.email}
                onChange={(e) => updateRecipient(index, { email: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={!!recipient.is_onetimer}
                  onChange={(e) => updateRecipient(index, { is_onetimer: e.target.checked })}
                />
                One-timer
              </label>
              <button
                type="button"
                className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                onClick={() => removeRecipient(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          disabled={isSaving}
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : mode === "create" ? "Create Appointment" : "Save Changes"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => router.push("/vesselmanager")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
