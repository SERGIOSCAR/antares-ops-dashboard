"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type VesselListItem = {
  id: string;
  name: string;
  port: string;
  slug?: string;
};

export default function VesselSetup({ existingVessels }: { existingVessels: VesselListItem[] }) {
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

  const router = useRouter();

  const onSubmit = async () => {
    setCreating(true);
    setError("");

    try {
      const grades = cargoGrades.split(",").map((x) => x.trim()).filter(Boolean);
      const recipientsList = recipients.split(",").map((x) => x.trim()).filter(Boolean);

      // Generate default stow plan
      const stow = Array.from({ length: holds }).flatMap((_, i) =>
        (grades.length ? grades : ["TOTAL"]).map((grade) => ({
          hold: i + 1,
          grade,
          totalMT: 0,
          condition: "",
        })),
      );

      // Get auth token
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

  return (
    <>
      {createdVessel && (
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
                className="h-10 rounded-md bg-blue-600 font-medium text-white hover:bg-blue-700"
              >
                Go to &quot;{createdVessel.name}&quot;
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdVessel.fullLink);
                }}
                className="h-10 rounded-md border border-slate-600 bg-slate-900 font-medium text-slate-100 hover:bg-slate-800"
              >
                Copy and Share Vessel Link
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatedVessel(null);
                  router.push("/admin");
                }}
                className="h-10 rounded-md bg-zinc-900 font-medium text-white hover:bg-zinc-800"
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
              <h2 className="mb-4 text-lg font-semibold text-slate-100">Create Vessel</h2>

              {error && (
                <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-300">Vessel Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="MV Example"
                      className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-300">Operation</label>
                    <select
                      value={operationType}
                      onChange={(e) => setOperationType(e.target.value as "LOAD" | "DISCHARGE")}
                      className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                    >
                      <option value="LOAD">Load</option>
                      <option value="DISCHARGE">Discharge</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-300">Port</label>
                    <input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="San Lorenzo"
                      className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-300">Terminal</label>
                    <input
                      value={terminal}
                      onChange={(e) => setTerminal(e.target.value)}
                      placeholder="Terminal XYZ"
                      className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-300"># Holds</label>
                    <input
                      type="number"
                      value={holds}
                      onChange={(e) => setHolds(Number(e.target.value))}
                      min={1}
                      max={30}
                      className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-300">Cargo Grades (comma-separated)</label>
                  <input
                    value={cargoGrades}
                    onChange={(e) => setCargoGrades(e.target.value)}
                    placeholder="Grade A Wheat, Grade B Soy"
                    className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-300">Email Recipients (comma-separated)</label>
                  <textarea
                    value={recipients}
                    onChange={(e) => setRecipients(e.target.value)}
                    placeholder="master@ship.com, ops@agency.com"
                    className="min-h-[70px] w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-300">Head Clerk Username</label>
                  <input
                    value={headUsername}
                    onChange={(e) => setHeadUsername(e.target.value)}
                    placeholder="head1"
                    className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <button
                  onClick={onSubmit}
                  disabled={creating || !name || !port || !terminal}
                  className="h-10 w-full rounded-md bg-zinc-900 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Vessel"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-100">Open Vessels</h2>
              {existingVessels?.length === 0 ? (
                <div className="text-sm text-slate-400">No open vessels yet.</div>
              ) : (
                <div>
                  {existingVessels?.map((vessel) => (
                    <div key={vessel.id} className="border-b border-slate-700 py-3">
                      {vessel.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
