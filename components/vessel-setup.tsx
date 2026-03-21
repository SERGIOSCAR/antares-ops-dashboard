"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type VesselListItem = {
  id: string;
  name: string;
  port: string;
  terminal?: string | null;
  short_id?: string;
  operation_type?: "LOAD" | "DISCHARGE";
  commenced_at?: string | null;
  has_shifts?: boolean;
};

type SelectedVessel = {
  id?: string;
  short_id?: string;
  name: string;
  port: string;
  terminal?: string | null;
  operation_type?: "LOAD" | "DISCHARGE";
  holds?: number | null;
  cargo_grades?: string[];
  default_recipients?: string[];
  open_link?: string;
};

export default function VesselSetup({
  existingVessels,
  appointmentId,
  allowCreate = true,
  selectedVessel,
}: {
  existingVessels: VesselListItem[];
  appointmentId?: string;
  allowCreate?: boolean;
  selectedVessel?: SelectedVessel | null;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [port, setPort] = useState("");
  const [terminal, setTerminal] = useState("");
  const [operationType, setOperationType] = useState<"LOAD" | "DISCHARGE">("LOAD");
  const [holds, setHolds] = useState(7);
  const [cargoGrades, setCargoGrades] = useState("");
  const [recipients, setRecipients] = useState("");
  const [headUsername, setHeadUsername] = useState("head1");
  const [error, setError] = useState("");
  const [createdVessel, setCreatedVessel] = useState<{ name: string; shortId: string; fullLink: string } | null>(null);
  const [savingSetup, setSavingSetup] = useState(false);
  const [openingSelected, setOpeningSelected] = useState(false);

  const router = useRouter();
  const inputClass =
    "h-10 w-full touch-manipulation rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500";
  const labelClass = "mb-1 block text-sm text-slate-300";
  const activeVessels = existingVessels.filter((vessel) => vessel.commenced_at || vessel.has_shifts);

  useEffect(() => {
    if (!selectedVessel) return;
    setName(selectedVessel.name || "");
    setPort(selectedVessel.port || "");
    setTerminal(selectedVessel.terminal || "");
    setOperationType(selectedVessel.operation_type || "LOAD");
    setHolds(selectedVessel.holds && selectedVessel.holds > 0 ? selectedVessel.holds : 7);
    setCargoGrades((selectedVessel.cargo_grades || []).join(", "));
    setRecipients((selectedVessel.default_recipients || []).join(", "));
  }, [selectedVessel]);

  const extractShortId = (pathOrUrl: string) => {
    const raw = String(pathOrUrl || "").trim();
    if (!raw) return "";
    const match = raw.match(/\/v\/([^/?#]+)/i);
    return match?.[1] || "";
  };

  const resolveAppointmentLink = async () => {
    if (!appointmentId) return selectedVessel?.open_link || "";
    const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}/shift-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as { data?: { link?: string }; error?: string };
    if (!res.ok || !json.data?.link) {
      throw new Error(json.error || "Failed to prepare ShiftReporter vessel");
    }
      return json.data.link;
  };

  const saveSetupAndOpen = async () => {
    setSavingSetup(true);
    setError("");
    try {
      const grades = cargoGrades.split(",").map((x) => x.trim()).filter(Boolean);
      const recipientsList = recipients.split(",").map((x) => x.trim()).filter(Boolean);

      const supa = supabaseBrowser();
      const {
        data: { session },
      } = await supa.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Unauthorized: no active session token.");
      }

      const body = {
        appointmentId: appointmentId || undefined,
        name: name.trim(),
        port: port.trim(),
        terminal: terminal.trim(),
        operationType,
        cargoGrades: grades,
        holds,
        recipients: recipientsList,
        headUsername: headUsername.trim().toLowerCase() || "head1",
        stow: [],
      };

      const res = await fetch("/api/shiftreporter/vessels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json?.shortId) {
        throw new Error(json?.error || "Failed to save ShiftReporter setup.");
      }

      router.push(`/v/${json.shortId}${appointmentId ? `?appointment_id=${appointmentId}` : ""}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save ShiftReporter setup.");
    } finally {
      setSavingSetup(false);
    }
  };

  const onSubmit = async () => {
    setCreating(true);
    setError("");

    try {
      const grades = cargoGrades.split(",").map((x) => x.trim()).filter(Boolean);
      const recipientsList = recipients.split(",").map((x) => x.trim()).filter(Boolean);

      const stow = Array.from({ length: holds }).flatMap((_, i) =>
        (grades.length ? grades : ["TOTAL"]).map((grade) => ({
          hold: i + 1,
          grade,
          totalMT: 0,
          condition: "",
        })),
      );

      const supa = supabaseBrowser();
      const {
        data: { session },
      } = await supa.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Unauthorized: no active session token.");
      }

      const body = {
        name,
        port,
        terminal,
        operationType,
        cargoGrades: grades,
        holds,
        recipients: recipientsList,
        headUsername: headUsername.trim().toLowerCase(),
        stow,
      };

      const res = await fetch("/api/shiftreporter/vessels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create vessel.");

      const fullLink = `/v/${json.shortId}`;
      setCreatedVessel({ name, shortId: json.shortId, fullLink });
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create vessel.");
    } finally {
      setCreating(false);
    }
  };

  const openSelectedVessel = async () => {
    setOpeningSelected(true);
    setError("");
    try {
      const link = await resolveAppointmentLink();
      if (!link) {
        throw new Error("No ShiftReporter vessel link available.");
      }
      router.push(link);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open ShiftReporter vessel");
    } finally {
      setOpeningSelected(false);
    }
  };

  return (
    <>
      {allowCreate && createdVessel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-100">Vessel Created Successfully</h3>
            <p className="mt-2 text-sm text-slate-300">Shareable vessel link:</p>
            <a
              href={`/v/${createdVessel.shortId}`}
              className="mt-2 block break-all rounded-md border border-slate-600 bg-slate-900 p-3 text-blue-400 underline"
            >
              {createdVessel.fullLink}
            </a>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => router.push(`/v/${createdVessel.shortId}`)}
                className="min-h-[44px] rounded-md bg-blue-600 font-medium text-white hover:bg-blue-700"
              >
                Go to &quot;{createdVessel.name}&quot;
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdVessel.fullLink);
                }}
                className="min-h-[44px] rounded-md border border-slate-600 bg-slate-900 font-medium text-slate-100 hover:bg-slate-800"
              >
                Copy and Share Vessel Link
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatedVessel(null);
                  router.push("/admin");
                }}
                className="min-h-[44px] rounded-md bg-zinc-900 font-medium text-white hover:bg-zinc-800"
              >
                Save and Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-slate-900 text-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">{allowCreate ? "Create Vessel" : "ShiftReporter Entry"}</h2>

              {error && (
                <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {allowCreate ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Vessel Name</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MV Example" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Operation</label>
                      <select
                        value={operationType}
                        onChange={(e) => setOperationType(e.target.value as "LOAD" | "DISCHARGE")}
                        className={inputClass}
                      >
                        <option value="LOAD">Load</option>
                        <option value="DISCHARGE">Discharge</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Port</label>
                      <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="San Lorenzo" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Terminal</label>
                      <input
                        value={terminal}
                        onChange={(e) => setTerminal(e.target.value)}
                        placeholder="Terminal XYZ"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className={labelClass}># Holds</label>
                      <input
                        type="number"
                        value={holds}
                        onChange={(e) => setHolds(Number(e.target.value))}
                        min={1}
                        max={30}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Cargo Grades (comma-separated)</label>
                    <input
                      value={cargoGrades}
                      onChange={(e) => setCargoGrades(e.target.value)}
                      placeholder="Grade A Wheat, Grade B Soy"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Email Recipients (comma-separated)</label>
                    <textarea
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                      placeholder="master@ship.com, ops@agency.com"
                      className="min-h-[70px] w-full touch-manipulation rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Head Clerk Username</label>
                    <input
                      value={headUsername}
                      onChange={(e) => setHeadUsername(e.target.value)}
                      placeholder="head1"
                      className={inputClass}
                    />
                  </div>

                  <button
                    onClick={onSubmit}
                    disabled={creating || !name || !port || !terminal}
                    className="min-h-[44px] w-full rounded-md bg-zinc-900 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Create Vessel"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedVessel || appointmentId ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Vessel Name</label>
                          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Operation</label>
                          <select
                            value={operationType}
                            onChange={(e) => setOperationType(e.target.value as "LOAD" | "DISCHARGE")}
                            className={inputClass}
                          >
                            <option value="LOAD">Load</option>
                            <option value="DISCHARGE">Discharge</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Port</label>
                          <input value={port} onChange={(e) => setPort(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Terminal</label>
                          <input value={terminal} onChange={(e) => setTerminal(e.target.value)} className={inputClass} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}># Holds</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={holds}
                            onChange={(e) => setHolds(Number(e.target.value))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Cargo Grades</label>
                          <input value={cargoGrades} onChange={(e) => setCargoGrades(e.target.value)} className={inputClass} />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Primary Email Recipients</label>
                        <textarea
                          value={recipients}
                          onChange={(e) => setRecipients(e.target.value)}
                          placeholder="master@ship.com, ops@agency.com"
                          className="min-h-[88px] w-full touch-manipulation rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                        />
                        <p className="mt-2 text-xs text-slate-400">
                          These are the primary recipients used by default when sending shift reports for this vessel.
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={saveSetupAndOpen}
                          disabled={savingSetup || !name || !port || !terminal}
                          className="min-h-[44px] rounded-md bg-zinc-900 px-4 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {savingSetup ? "Saving..." : selectedVessel?.id ? "Save Setup & Open" : "Create Setup & Open"}
                        </button>
                        {selectedVessel?.open_link ? (
                          <button
                            type="button"
                            onClick={openSelectedVessel}
                            disabled={openingSelected}
                            className="min-h-[44px] rounded-md border border-slate-600 px-4 py-3 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
                          >
                            {openingSelected ? "Opening..." : "Open Existing"}
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-6 text-slate-300">
                        Open an active vessel from the list, or enter through an appointment link to set up ShiftReporter operational details.
                      </p>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
                        ShiftReporter setup is where you define holds, specific grades, and report recipients before commencing operations.
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Open Vessels</h2>
              <div className="mb-4 text-sm text-slate-300">Vessels created here will appear in the operations dashboard.</div>
              <div className="space-y-1">
                {activeVessels.length ? (
                  activeVessels.map((vessel) => (
                    <div key={vessel.id}>
                      <Link
                        href={vessel.short_id ? `/v/${vessel.short_id}` : "#"}
                        className="inline-block text-[1.05rem] font-semibold leading-8 text-lime-400 transition hover:text-lime-300"
                      >
                        {vessel.name} ({vessel.port})
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400">
                    No active vessels yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
