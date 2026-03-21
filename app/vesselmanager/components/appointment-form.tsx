"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, EtaNoticeLine, EtaNoticeSettings, SubAgent } from "@/lib/vesselmanager/types";

type Props = {
  mode: "create" | "edit";
  appointmentId?: string;
  initialAppointment?: Partial<Appointment>;
  initialRecipients?: unknown[];
  initialServiceChecklistAta?: string | null;
  initialEtaNotice?: EtaNoticeSettings;
  returnTo?: string;
};

const appointedForOptions = [
  "OPA",
  "FULL",
  "CHARTAGENT",
  "HUSBANDRY",
  "HOLDS",
  "FUNDING",
  "SALVAGE",
  "OTHER (see Other Appointments)",
];

function digitsOnly(input: string, maxLen: number) {
  return input.replace(/\D/g, "").slice(0, maxLen);
}

const card = "rounded-xl border border-slate-700 bg-slate-800 p-5";
const label = "text-xs font-medium uppercase tracking-wide text-slate-300";
const input = "mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100";

const etaServicesTemplate: Array<{
  service_name: string;
  in_mode: "none" | "yes" | "qty";
  out_mode: "none" | "yes" | "qty";
  qty_style?: boolean;
}> = [
  { service_name: "RIVER PLATE PILOTS", in_mode: "yes", out_mode: "yes" },
  { service_name: "RIVER PARANA PILOTS", in_mode: "yes", out_mode: "yes" },
  { service_name: "PORT PILOTS", in_mode: "yes", out_mode: "yes" },
  { service_name: "TUGS", in_mode: "qty", out_mode: "qty", qty_style: true },
  { service_name: "LINEMEN", in_mode: "yes", out_mode: "yes" },
  { service_name: "MOTOR LAUNCH", in_mode: "qty", out_mode: "qty", qty_style: true },
  { service_name: "BUNKER SUPPLIER", in_mode: "yes", out_mode: "yes" },
  { service_name: "CARGO SURVEY", in_mode: "yes", out_mode: "yes" },
  { service_name: "BUNKER SURVEY", in_mode: "yes", out_mode: "yes" },
];

const supplierStorageKey = "eta_notice_known_suppliers_v1";
const defaultKnownSuppliers = [
  "River Plate Pilots",
  "River Parana Pilots",
  "Port Pilots",
  "Tugs",
  "Linemen",
  "Motor Launch",
  "Bunker Supplier",
  "Cargo Survey",
  "Bunker Survey",
];

function defaultEtaNoticeLines(): EtaNoticeLine[] {
  return etaServicesTemplate.map((row) => ({
    supplier_name: "",
    supplier_emails: "",
    service_name: row.service_name,
    in_mode: row.in_mode,
    in_qty: null,
    out_mode: row.out_mode,
    out_qty: null,
    trigger_eta_eosp: true,
    trigger_epob: true,
    trigger_etb: true,
    trigger_etd: true,
    trigger_eta_bunker: true,
    is_active: true,
  }));
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export default function AppointmentForm({
  mode,
  appointmentId,
  initialAppointment,
  initialRecipients,
  initialServiceChecklistAta,
  initialEtaNotice,
  returnTo = "/vesselmanager",
}: Props) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [serviceChecklistAta, setServiceChecklistAta] = useState<string | null>(initialServiceChecklistAta || null);
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>(defaultKnownSuppliers);
  const [etaNotice, setEtaNotice] = useState<EtaNoticeSettings>(() => {
    const initialLines = Array.isArray(initialEtaNotice?.lines) ? initialEtaNotice.lines : [];
    const byService = new Map(initialLines.map((line) => [line.service_name, line]));
    return {
      enabled: initialEtaNotice?.enabled ?? true,
      first_service_starts_at: initialEtaNotice?.first_service_starts_at ?? null,
      last_service_ends_at: initialEtaNotice?.last_service_ends_at ?? null,
      lines: defaultEtaNoticeLines().map((line) => ({
        ...line,
        ...(byService.get(line.service_name) || {}),
      })),
    };
  });

  const [form, setForm] = useState({
    vessel_name: initialAppointment?.vessel_name ?? "",
    port: initialAppointment?.port ?? "",
    nomination_received_on: initialAppointment?.nomination_received_on ?? "",
    accounting_reference: initialAppointment?.accounting_reference ?? "",
    pda_sent_on: initialAppointment?.pda_sent_on ?? "",
    pda_not_required: initialAppointment?.pda_not_required ?? false,
    ada_created_on: initialAppointment?.ada_created_on ?? "",
    ada_sent_on: initialAppointment?.ada_sent_on ?? "",
    fda_created_on: initialAppointment?.fda_created_on ?? "",
    fda_sent_on: initialAppointment?.fda_sent_on ?? "",
    terminal: initialAppointment?.terminal ?? "",
    cargo_operation: initialAppointment?.cargo_operation ?? "",
    cargo_grade: initialAppointment?.cargo_grade ?? "",
    cargo_qty: initialAppointment?.cargo_qty?.toString() ?? "",
    role: initialAppointment?.role ?? "",
    appointed_by: initialAppointment?.appointed_by ?? "",
    charterer_agent: initialAppointment?.charterer_agent ?? "",
    thanks_to: initialAppointment?.thanks_to ?? "",
    other_agents: initialAppointment?.other_agents ?? "",
    other_agents_role: initialAppointment?.other_agents_role ?? "",
    sub_agent_id: initialAppointment?.sub_agent_id ?? "",
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

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/vesselmanager/sub-agents", { cache: "no-store" });
        const json = (await res.json()) as { data?: SubAgent[] };
        if (!active || !res.ok) return;
        setSubAgents(json.data ?? []);
      } catch {
        // non-blocking
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(supplierStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = Array.from(new Set(parsed.map((x) => String(x || "").trim()).filter(Boolean)));
        if (clean.length) setKnownSuppliers(clean);
      }
    } catch {
      // ignore local cache parse issues
    }
  }, []);

  const rememberSupplier = (name: string) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    setKnownSuppliers((prev) => {
      const next = Array.from(new Set([trimmed, ...prev])).slice(0, 200);
      try {
        localStorage.setItem(supplierStorageKey, JSON.stringify(next));
      } catch {
        // ignore local cache write issues
      }
      return next;
    });
  };

  const requiresAlerts = useMemo(() => {
    if (form.notify_none) return false;
    return form.notify_eta_suppliers || form.notify_eta_agents_terminals || form.needs_daily_prospect;
  }, [form]);

  const updateField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEtaLine = (index: number, patch: Partial<EtaNoticeLine>) => {
    setEtaNotice((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const addOneTimerEtaLine = () => {
    setEtaNotice((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          supplier_name: "",
          supplier_emails: "",
          service_name: "ONE-TIMER SERVICE",
          in_mode: "none",
          in_qty: null,
          out_mode: "none",
          out_qty: null,
          trigger_eta_eosp: true,
          trigger_epob: true,
          trigger_etb: true,
          trigger_etd: true,
          trigger_eta_bunker: true,
          is_active: true,
        },
      ],
    }));
  };

  const removeEtaLine = (index: number) => {
    setEtaNotice((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.vessel_name.trim()) {
      setError("Vessel name is required.");
      return;
    }
    if (!form.port.trim()) {
      setError("Port is required.");
      return;
    }
    if (!form.nomination_received_on) {
      setError("Date of appointment is required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        vessel_name: form.vessel_name.trim(),
        port: form.port || null,
        nomination_received_on: form.nomination_received_on,
        accounting_reference: form.accounting_reference.trim() || null,
        pda_sent_on: form.pda_sent_on || null,
        pda_not_required: !!form.pda_not_required,
        ada_created_on: form.ada_created_on || null,
        ada_sent_on: form.ada_sent_on || null,
        fda_created_on: form.fda_created_on || null,
        fda_sent_on: form.fda_sent_on || null,
        terminal: form.terminal || null,
        cargo_operation: form.cargo_operation || null,
        cargo_grade: form.cargo_grade || null,
        cargo_qty: form.cargo_qty ? Number(form.cargo_qty) : null,
        role: form.role || null,
        appointed_by: form.appointed_by || null,
        charterer_agent: form.charterer_agent || null,
        thanks_to: form.thanks_to || null,
        other_agents: form.other_agents || null,
        other_agents_role: form.other_agents_role || null,
        sub_agent_id: form.sub_agent_id || null,
        notify_eta_suppliers: form.notify_none ? false : form.notify_eta_suppliers,
        notify_eta_agents_terminals: form.notify_none ? false : form.notify_eta_agents_terminals,
        notify_none: form.notify_none,
        needs_daily_prospect: form.notify_none ? false : form.needs_daily_prospect,
        eta_notice: {
          enabled: etaNotice.enabled,
          first_service_starts_at: etaNotice.first_service_starts_at || null,
          last_service_ends_at: etaNotice.last_service_ends_at || null,
          lines: etaNotice.lines,
        },
      };

      const url = mode === "create" ? "/api/vesselmanager/appointments" : `/api/vesselmanager/appointments/${appointmentId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as { error?: string; data?: { id?: string } };
      if (!res.ok) {
        throw new Error(json.error || "Failed to save appointment");
      }

      const savedAppointmentId = mode === "create" ? json.data?.id : appointmentId;
      if (!savedAppointmentId) {
        throw new Error("Missing appointment id after save");
      }

      const checklistChanged =
        (initialServiceChecklistAta || null) !== (serviceChecklistAta || null);
      if (checklistChanged) {
        const checklistRes = await fetch("/api/vesselmanager/timeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointment_id: savedAppointmentId,
            event_type: "COMPLETE_OPS",
            ata: serviceChecklistAta,
            eta: null,
          }),
        });
        const checklistJson = (await checklistRes.json()) as { error?: string };
        if (!checklistRes.ok) {
          throw new Error(checklistJson.error || "Failed to update service checklist status");
        }
      }

      router.push(returnTo);
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
          <div className="w-full max-w-xs space-y-3">
            <label className={`${label} block text-left`}>
              Date of Appointment *
              <input
                type="date"
                className={input}
                value={form.nomination_received_on}
                onChange={(e) => updateField("nomination_received_on", e.target.value)}
              />
            </label>
            <label className={`${label} block text-left`}>
              Accounting Reference
              <input
                className={input}
                value={form.accounting_reference}
                readOnly
                disabled
                placeholder="Assigned in D/A Manager"
              />
            </label>
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <label className={label}>
              Type of Operation
              <select className={input} value={form.cargo_operation} onChange={(e) => updateField("cargo_operation", e.target.value)}>
                <option value="">Select</option>
                <option value="LOAD">LOAD</option>
                <option value="DISCH">DISCH</option>
                <option value="BUNKER_CALL">Bunker Call</option>
                <option value="REPAIRS">Repairs</option>
                <option value="OTHERS">Others</option>
              </select>
            </label>
            <label className={label}>
              Type of Cargo
              <input className={input} value={form.cargo_grade} onChange={(e) => updateField("cargo_grade", e.target.value)} />
            </label>
            <label className={label}>
              Cargo Qty
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className={input}
                value={form.cargo_qty}
                onChange={(e) => updateField("cargo_qty", digitsOnly(e.target.value, 6))}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              Thanks To
              <input
                className={input}
                value={form.thanks_to}
                onChange={(e) => updateField("thanks_to", e.target.value)}
                placeholder="Indicated by (optional)"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
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
            <label className={label}>
              Charterer&apos;s Agent
              <input className={input} value={form.charterer_agent} onChange={(e) => updateField("charterer_agent", e.target.value)} />
            </label>
            <label className={label}>
              Sub-Agent
              <select
                className={input}
                value={form.sub_agent_id}
                onChange={(e) => updateField("sub_agent_id", e.target.value)}
              >
                <option value="">None</option>
                {subAgents.map((sa) => (
                  <option key={sa.id} value={sa.id}>
                    {sa.name} ({sa.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
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
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Service Checklist</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={!!serviceChecklistAta}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setServiceChecklistAta((prev) => prev || new Date().toISOString());
                      return;
                    }
                    setServiceChecklistAta(null);
                  }}
                />
                Service Checklist Completed
              </label>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {serviceChecklistAta
                ? `Timestamp: ${formatTimestamp(serviceChecklistAta)}`
                : "When checked, vessel will be closed and timestamped."}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Alert outcome preview: {requiresAlerts ? "Warning icons enabled by schedule." : "No warning alerts (can map to soft violet-cross state)."}
        </p>
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Daily ETA Notices Matrix</h2>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={etaNotice.enabled}
              onChange={(e) => setEtaNotice((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Enabled
          </label>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className={label}>
            1st Service Starts At (Place)
            <input
              className={input}
              value={etaNotice.first_service_starts_at || ""}
              placeholder="Place"
              onChange={(e) =>
                setEtaNotice((prev) => ({
                  ...prev,
                  first_service_starts_at: e.target.value || null,
                }))
              }
            />
          </label>
          <label className={label}>
            Last Service Ends At (Place)
            <input
              className={input}
              value={etaNotice.last_service_ends_at || ""}
              placeholder="Place"
              onChange={(e) =>
                setEtaNotice((prev) => ({
                  ...prev,
                  last_service_ends_at: e.target.value || null,
                }))
              }
            />
          </label>
        </div>

        <div className="mb-3">
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-100 hover:bg-slate-700"
            onClick={addOneTimerEtaLine}
          >
            Add One-timer
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[1180px] text-[11px] leading-tight">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[19%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[5.8%]" />
              <col className="w-[5.8%]" />
              <col className="w-[5.8%]" />
              <col className="w-[5.8%]" />
              <col className="w-[7.8%]" />
            </colgroup>
            <thead className="bg-slate-900 text-[10px] uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Service</th>
                <th className="px-2 py-1.5 text-left font-semibold">Supplier</th>
                <th className="px-2 py-1.5 text-left font-semibold">Supplier Emails</th>
                <th className="px-2 py-1.5 text-left font-semibold">In</th>
                <th className="px-2 py-1.5 text-left font-semibold">Out</th>
                <th className="px-1 py-1.5 text-center font-semibold whitespace-normal">ETA EOSP</th>
                <th className="px-1 py-1.5 text-center font-semibold whitespace-normal">EPOB</th>
                <th className="px-1 py-1.5 text-center font-semibold whitespace-normal">ETB</th>
                <th className="px-1 py-1.5 text-center font-semibold whitespace-normal">ETD</th>
                <th className="px-1 py-1.5 text-center font-semibold whitespace-normal">ETA BUNKER</th>
              </tr>
            </thead>
            <tbody>
              {etaNotice.lines.map((line, index) => {
                const template = etaServicesTemplate.find((x) => x.service_name === line.service_name);
                const isQtyStyle = !!template?.qty_style;
                const isCustom = !template;
                return (
                <tr key={`${line.service_name}-${index}`} className="border-t border-slate-700 bg-slate-800 text-[11px]">
                  <td className="px-2 py-1.5">
                    {isCustom ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]"
                          value={line.service_name || ""}
                          onChange={(e) => updateEtaLine(index, { service_name: e.target.value })}
                          placeholder="Service name"
                        />
                        <button
                          type="button"
                          className="rounded border border-red-700 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950/40"
                          onClick={() => removeEtaLine(index)}
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      line.service_name
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="w-[190px] rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]"
                      value={line.supplier_name || ""}
                      onChange={(e) => updateEtaLine(index, { supplier_name: e.target.value })}
                      onBlur={(e) => rememberSupplier(e.target.value)}
                      list="eta-known-suppliers"
                      placeholder="Supplier name"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="w-[210px] rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]"
                      value={line.supplier_emails || ""}
                      onChange={(e) => updateEtaLine(index, { supplier_emails: e.target.value })}
                      placeholder="emails comma separated"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {isQtyStyle ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={9}
                          className="w-12 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]"
                          value={line.in_qty ?? 0}
                          onChange={(e) => {
                            const qty = Number(String(e.target.value || "0").slice(0, 1));
                            updateEtaLine(index, {
                              in_qty: qty,
                              in_mode: qty > 0 ? "qty" : "none",
                            });
                          }}
                        />
                      </div>
                    ) : (
                      <input
                        type="checkbox"
                        checked={line.in_mode !== "none"}
                        onChange={(e) => updateEtaLine(index, { in_mode: e.target.checked ? "yes" : "none", in_qty: null })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isQtyStyle ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={9}
                          className="w-12 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]"
                          value={line.out_qty ?? 0}
                          onChange={(e) => {
                            const qty = Number(String(e.target.value || "0").slice(0, 1));
                            updateEtaLine(index, {
                              out_qty: qty,
                              out_mode: qty > 0 ? "qty" : "none",
                            });
                          }}
                        />
                      </div>
                    ) : (
                      <input
                        type="checkbox"
                        checked={line.out_mode !== "none"}
                        onChange={(e) => updateEtaLine(index, { out_mode: e.target.checked ? "yes" : "none", out_qty: null })}
                      />
                    )}
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!line.trigger_eta_eosp}
                      onChange={(e) => updateEtaLine(index, { trigger_eta_eosp: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!line.trigger_epob}
                      onChange={(e) => updateEtaLine(index, { trigger_epob: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!line.trigger_etb}
                      onChange={(e) => updateEtaLine(index, { trigger_etb: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!line.trigger_etd}
                      onChange={(e) => updateEtaLine(index, { trigger_etd: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!line.trigger_eta_bunker}
                      onChange={(e) => updateEtaLine(index, { trigger_eta_bunker: e.target.checked })}
                    />
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <datalist id="eta-known-suppliers">
          {knownSuppliers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          disabled={isSaving}
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : mode === "create" ? "Create Appointment" : "Save & Return"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => router.push(returnTo)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
