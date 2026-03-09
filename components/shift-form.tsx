"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { PREDEFINED_EVENTS } from "@/lib/event-options";

interface ShiftFormProps {
  vesselId: string;
  holds: number;
  grades: string[];
  operationType: "LOAD" | "DISCHARGE";
  shiftType?: string;
  stowPlan?: Array<{ hold: number; grade: string; total_mt: number; condition?: string }>;
  cumulativeTotals?: Record<number, Record<string, number>>;
}

export default function ShiftForm({ 
  vesselId, 
  holds, 
  grades,
  operationType,
  shiftType: vesselShiftType,
  stowPlan,
  cumulativeTotals 
}: ShiftFormProps) {
  type DelayItem = { from: string; to: string; eventType: string; addon: string };

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Convert holds number to array
  const holdsArray = useMemo(
    () =>
      typeof holds === "number"
        ? Array.from({ length: holds }, (_, i) => i + 1)
        : Array.isArray(holds)
        ? holds
        : [],
    [holds]
  );

  const gradesArray = useMemo(() => (Array.isArray(grades) ? grades : []), [grades]);
  const holdGradeMap = useMemo(() => {
    const map: Record<number, string> = {};
    (stowPlan || []).forEach((item) => {
      if (typeof item?.hold === "number" && item.grade) {
        map[item.hold] = item.grade;
      }
    });
    if (Object.keys(map).length === 0 && gradesArray.length === 1) {
      holdsArray.forEach((hold) => {
        map[hold] = gradesArray[0];
      });
    }
    return map;
  }, [stowPlan, gradesArray, holdsArray]);
  
  // Simplified date and shift selection
  const [reportDate, setReportDate] = useState("");
  const reportDateRef = useRef<HTMLInputElement | null>(null);
  const [shiftType, setShiftType] = useState<string>("");
  
  const [notes, setNotes] = useState("");
  const [recipients, setRecipients] = useState("");
  const [delays, setDelays] = useState<DelayItem[]>([]);
  const [cargoData, setCargoData] = useState<Record<string, Record<string, number>>>({});
  
  // Accumulated and Remaining fields
  const [accumulatedData, setAccumulatedData] = useState<Record<string, Record<string, number>>>({});
  const [remainingData, setRemainingData] = useState<Record<string, Record<string, number>>>({});

  // Check for existing shift
  const [existingShift, setExistingShift] = useState<{ id: string } | null>(null);

  const parseSchedule = (schedule?: string) => {
    const fallback = "00-06/06-12/12-18/18-24";
    const source = schedule?.trim() ? schedule : fallback;

    return source
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [startRaw, endRaw] = part.split("-").map((x) => x.trim());
        const startHour = Number(startRaw.split(":")[0]);
        const endHour = Number(endRaw.split(":")[0]);
        if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return null;

        const normalizedEndHour = endHour === 24 ? 0 : endHour;

        return {
          value: `${String(startHour).padStart(2, "0")}-${String(endHour === 24 ? 24 : endHour).padStart(2, "0")}`,
          label: `${String(startHour).padStart(2, "0")}:00 - ${String(endHour).padStart(2, "0")}:00`,
          startHour,
          endHour: normalizedEndHour,
          crossesMidnight: normalizedEndHour <= startHour,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  };

  const scheduleOptions = useMemo(() => {
    const parsed = parseSchedule(vesselShiftType);

    const starts = parsed.map((o) => o.startHour).sort((a, b) => a - b);
    const isTypeA = JSON.stringify(starts) === JSON.stringify([0, 6, 12, 18]);
    const isTypeB = JSON.stringify(starts) === JSON.stringify([1, 7, 13, 19]);

    if (!isTypeA && !isTypeB) return parsed;

    const bothTypes = [
      { value: "00-06", label: "00:00 - 06:00" },
      { value: "06-12", label: "06:00 - 12:00" },
      { value: "12-18", label: "12:00 - 18:00" },
      { value: "18-24", label: "18:00 - 24:00" },
      { value: "01-07", label: "01:00 - 07:00" },
      { value: "07-13", label: "07:00 - 13:00" },
      { value: "13-19", label: "13:00 - 19:00" },
      { value: "19-01", label: "19:00 - 01:00" },
    ];

    return bothTypes.map((o) => {
      const [startRaw, endRaw] = o.value.split("-").map(Number);
      const normalizedEndHour = endRaw === 24 ? 0 : endRaw;
      return {
        ...o,
        startHour: startRaw,
        endHour: normalizedEndHour,
        crossesMidnight: normalizedEndHour <= startRaw,
      };
    });
  }, [vesselShiftType]);

  const groupedScheduleOptions = useMemo(() => {
    const typeAValues = new Set(["00-06", "06-12", "12-18", "18-24"]);
    const typeBValues = new Set(["01-07", "07-13", "13-19", "19-01"]);

    const typeA = scheduleOptions.filter((opt) => typeAValues.has(opt.value));
    const typeB = scheduleOptions.filter((opt) => typeBValues.has(opt.value));
    const custom = scheduleOptions.filter(
      (opt) => !typeAValues.has(opt.value) && !typeBValues.has(opt.value)
    );

    return { typeA, typeB, custom };
  }, [scheduleOptions]);

  useEffect(() => {
    if (!scheduleOptions.length) return;
    setShiftType((prev) =>
      prev && scheduleOptions.some((o) => o.value === prev) ? prev : scheduleOptions[0].value
    );
  }, [scheduleOptions]);

  // Calculate shift start/end times from date and shift type
  const getShiftTimes = useCallback(
    (date: string, shift: string) => {
      if (!date) return { start: "", end: "" };

      const selected = scheduleOptions.find((opt) => opt.value === shift);
      if (!selected) return { start: "", end: "" };

      const start = `${date}T${String(selected.startHour).padStart(2, "0")}:00:00`;

      let endDate = date;
      if (selected.crossesMidnight) {
        const nextDay = new Date(`${date}T00:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endDate = nextDay.toISOString().slice(0, 10);
      }

      const end = `${endDate}T${String(selected.endHour).padStart(2, "0")}:00:00`;

      return { start, end };
    },
    [scheduleOptions]
  );

  // Check for existing shift when date/shift changes
  useEffect(() => {
    const checkExistingShift = async () => {
      if (!reportDate || !shiftType) {
        setExistingShift(null);
        return;
      }
      
      const { start, end } = getShiftTimes(reportDate, shiftType);
      
      const supabase = supabaseBrowser();
      const { data, error } = await supabase
        .from('shift_reports')
        .select('*')
        .eq('vessel_id', vesselId)
        .eq('shift_start', start)
        .eq('shift_end', end)
        .maybeSingle();
      
      if (error) {
        setExistingShift(null);
        return;
      }
      
      setExistingShift(data || null);
    };
    
    checkExistingShift();
  }, [reportDate, shiftType, vesselId, getShiftTimes]);

  // Calculate accumulated and remaining dynamically
  useEffect(() => {
    if (!stowPlan || !Array.isArray(stowPlan)) {
      return;
    }
    
    const newAccumulated: Record<string, Record<string, number>> = {};
    const newRemaining: Record<string, Record<string, number>> = {};

    holdsArray.forEach(hold => {
      const grade = holdGradeMap[hold];
      if (!grade) return;

      const plannedEntry = Array.isArray(stowPlan)
        ? stowPlan.find((p) => p.hold === hold && p.grade === grade)
        : null;
      const planned = plannedEntry?.total_mt || 0;

      const loaded = cumulativeTotals?.[hold]?.[grade] || 0;
      const thisShift = cargoData?.[hold]?.[grade] || 0;

      if (!newAccumulated[hold]) newAccumulated[hold] = {};
      if (!newRemaining[hold]) newRemaining[hold] = {};

      const accumulated = loaded + thisShift;
      newAccumulated[hold][grade] = accumulated;
      newRemaining[hold][grade] = planned - accumulated;
    });

    setAccumulatedData(newAccumulated);
    setRemainingData(newRemaining);
  }, [cargoData, stowPlan, cumulativeTotals, holdsArray, holdGradeMap]);

  const handleCargoChange = (hold: number, grade: string, value: number) => {
    // Get planned amount for this hold/grade
    const plannedEntry = Array.isArray(stowPlan) 
      ? stowPlan.find((p) => p.hold === hold && p.grade === grade)
      : null;
    const planned = plannedEntry?.total_mt || 0;
    
    // Get already loaded
    const loaded = cumulativeTotals?.[hold]?.[grade] || 0;
    
    // Calculate what accumulated would be with this new value
    const newAccumulated = loaded + value;
    
    // For LOAD, warn when above plan. For DISCHARGE, allow over-discharge (negative balance).
    if (operationType === "LOAD" && newAccumulated > planned && planned > 0) {
      alert(
        `âš ï¸ Hold ${hold} Total Surpasses Stowplan!\n\n` +
        `Grade: ${grade}\n` +
        `Planned: ${planned.toFixed(2)} MT\n` +
        `Already Loaded: ${loaded.toFixed(2)} MT\n` +
        `This Shift: ${value.toFixed(2)} MT\n` +
        `Total Would Be: ${newAccumulated.toFixed(2)} MT\n\n` +
        `Excess: ${(newAccumulated - planned).toFixed(2)} MT\n\n` +
        `Please revise data or update Stow Plan.`
      );
      return; // Don't update the value
    }
    
    setCargoData(prev => ({
      ...prev,
      [hold]: {
        [grade]: value
      }
    }));
  };

  const normalizeHHMMInput = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^\d{2}:\d{2}$/.test(raw)) {
      const [hh, mm] = raw.split(":").map(Number);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return raw;
      return "";
    }

    const digits = raw.replace(/\D/g, "");
    if (digits.length === 4) {
      const hh = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
    }

    return "";
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (!reportDate || !shiftType) {
        alert("Please select a date and shift");
        setLoading(false);
        return;
      }

      // If duplicate shift exists, ask for confirmation
      if (existingShift) {
        const confirmed = confirm(
          `âš ï¸ This shift has been loaded already.\n\n` +
          `Existing shift:\n` +
          `Date: ${reportDate}\n` +
          `Shift: ${shiftType}\n\n` +
          `If you wish to proceed with this new one as revised click YES.\n` +
          `Otherwise click NO.`
        );
        
        if (!confirmed) {
          setLoading(false);
          return; // User cancelled, don't submit
        }
      }

      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const { start, end } = getShiftTimes(reportDate, shiftType);

      // Prepare cargo lines
      const lines = [];
      for (const hold of holdsArray) {
        const grade = holdGradeMap[hold];
        if (!grade) continue;

        const tonnage = cargoData[String(hold)]?.[grade] || 0;
        if (tonnage === 0) continue;

        const holdKey = String(hold);
        const accumulated = accumulatedData[holdKey]?.[grade] || 0;
        const remaining = remainingData[holdKey]?.[grade] || 0;

        lines.push({
          hold,
          grade,
          thisShiftMT: tonnage,
          accumulatedMT: accumulated,
          remainingMT: remaining,
          condition:
            stowPlan?.find((p) => p.hold === hold && p.grade === grade)?.condition ||
            stowPlan?.find((p) => p.hold === hold)?.condition ||
            "",
        });
      }

      const cleanedDelays = delays
        .filter((d) => d.from.trim() || d.to.trim() || d.eventType.trim() || d.addon.trim())
        .map((d) => ({
          from: normalizeHHMMInput(d.from),
          to: d.to.trim() ? normalizeHHMMInput(d.to) : "",
          reason: d.eventType.trim()
            ? `${d.eventType.trim()}${d.addon.trim() ? ` - ${d.addon.trim()}` : ""}`
            : d.addon.trim(),
          originalFrom: d.from.trim(),
          originalTo: d.to.trim(),
        }));

      for (const d of cleanedDelays) {
        if (!d.from) {
          alert("Each event/interruption row must have a valid FROM time (HHMM or HH:MM).");
          setLoading(false);
          return;
        }
        if (d.originalTo && !d.to) {
          alert("TO time must be valid (HHMM or HH:MM) when provided.");
          setLoading(false);
          return;
        }
      }

      let payload = {
        vesselId,
        shiftStart: start,
        shiftEnd: end,
        shiftType,
        notes,
        lines,
        delays: cleanedDelays.map(({ from, to, reason }) => ({ from, to, reason })),
        recipients: recipients.split(",").map(e => e.trim()).filter(Boolean),
        isRevised: !!existingShift
      };

      let res = await fetch("/api/shiftreporter/shifts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const conflictData = await res.json().catch(() => ({}));
        if (conflictData?.error === "SHIFT_ALREADY_EXISTS" && !payload.isRevised) {
          const confirmed = confirm(
            `âš ï¸ This shift has been loaded already.\n\n` +
            `If you wish to proceed with this new one as revised click YES.\n` +
            `Otherwise click NO.`
          );

          if (!confirmed) {
            setLoading(false);
            return;
          }

          payload = { ...payload, isRevised: true };
          res = await fetch("/api/shiftreporter/shifts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        }
      }

      const responseData = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorData = responseData;
        throw new Error(errorData.error || `Failed to submit shift report (${res.status})`);
      }

      const email = responseData?.email as { success?: boolean; error?: string; emailId?: string } | undefined;
      const submitMessage = payload.isRevised
        ? "âœ… Shift report REVISED successfully!"
        : "âœ… Shift report submitted successfully!";

      const emailMessage = email?.success
        ? `\n\nðŸ“§ Email accepted by provider${email.emailId ? ` (ref: ${email.emailId})` : ""}.`
        : `\n\nâš ï¸ Shift saved, but email was not confirmed: ${email?.error || "Unknown email issue"}`;
      
      alert(`${submitMessage}${email?.success ? "" : "\n\nâš ï¸ Shift saved, but email was not confirmed."}`);
      router.refresh();

      // Reset form
      setReportDate("");
      setShiftType(scheduleOptions[0]?.value || "");
      setNotes("");
      setRecipients("");
      setDelays([]);
      setCargoData({});
      setExistingShift(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to submit shift report";
      alert(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 border rounded-lg bg-slate-800 shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Submit Shift Report</h2>
      
      {existingShift && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded">
          <p className="text-yellow-800 font-semibold">
            âš ï¸ This shift has been loaded already. Submit as revised only if you want to replace it.
          </p>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Simplified Date and Shift Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Report Date</label>
            <div className="flex items-center gap-2">
              <input
                ref={reportDateRef}
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                onFocus={() => {
                  const input = reportDateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
                  if (input?.showPicker) input.showPicker();
                }}
                className="w-full touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                className="min-h-[44px] rounded border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  const input = reportDateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
                  if (input?.showPicker) {
                    input.showPicker();
                  } else {
                    input?.focus();
                  }
                }}
              >
                Calendar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Shift Type</label>
            <select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value)}
              className="w-full touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100 focus:ring-2 focus:ring-blue-500"
            >
              {groupedScheduleOptions.typeA.length > 0 && groupedScheduleOptions.typeB.length > 0 ? (
                <>
                  <optgroup label="Type A (00-06 / 06-12 / 12-18 / 18-24)">
                    {groupedScheduleOptions.typeA.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Type B (01-07 / 07-13 / 13-19 / 19-01)">
                    {groupedScheduleOptions.typeB.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : (
                groupedScheduleOptions.custom.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              )}
            </select>
            {groupedScheduleOptions.typeA.length > 0 && groupedScheduleOptions.typeB.length > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                Choose from Type A or Type B schedule windows.
              </p>
            )}
          </div>
        </div>

        {/* Events / Interruptions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">Events / Interruptions</h3>
            <button
              type="button"
              onClick={() => setDelays((prev) => [...prev, { from: "", to: "", eventType: "", addon: "" }])}
              className="min-h-[44px] rounded bg-zinc-800 px-3 py-1 text-sm text-white hover:bg-zinc-700"
            >
              + Add Event
            </button>
          </div>

          {delays.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Add event times (e.g. 02:30â€“03:15 meal break) or isolated events (e.g. 04:10 hatch covers opened).
            </p>
          ) : (
            <div className="space-y-2">
              {delays.map((d, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={d.from}
                    onChange={(e) =>
                      setDelays((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, from: e.target.value } : row))
                      )
                    }
                    placeholder="FROM HH:MM"
                    onBlur={(e) => {
                      const formatted = normalizeHHMMInput(e.target.value);
                      if (formatted) {
                        setDelays((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, from: formatted } : row))
                        );
                      }
                    }}
                    className="col-span-2 touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
                  />
                  <input
                    type="text"
                    value={d.to}
                    onChange={(e) =>
                      setDelays((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, to: e.target.value } : row))
                      )
                    }
                    placeholder="TO HH:MM (optional)"
                    onBlur={(e) => {
                      if (!e.target.value.trim()) return;
                      const formatted = normalizeHHMMInput(e.target.value);
                      if (formatted) {
                        setDelays((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, to: formatted } : row))
                        );
                      }
                    }}
                    className="col-span-2 touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
                  />
                  <div className="col-span-3">
                    <input
                      list="predefined-events"
                      type="text"
                      value={d.eventType}
                      onChange={(e) =>
                        setDelays((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, eventType: e.target.value } : row))
                        )
                      }
                      placeholder="Type/select event"
                      className="w-full touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
                    />
                  </div>
                  <input
                    type="text"
                    value={d.addon}
                    onChange={(e) =>
                      setDelays((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, addon: e.target.value } : row))
                      )
                    }
                    placeholder="Specific add-on / manual text"
                    className="col-span-4 touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setDelays((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 min-h-[44px] rounded border border-red-300 p-2 text-red-600 hover:bg-red-900/30"
                  >
                    âœ•
                  </button>
                </div>
              ))}
            </div>
          )}
          <datalist id="predefined-events">
            {PREDEFINED_EVENTS.map((event) => (
              <option key={event} value={event} />
            ))}
          </datalist>
        </div>

        {/* Cargo Input - ONE GRADE PER HOLD */}
        <div>
          <h3 className="font-semibold text-lg mb-3">Cargo Operations</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-700 bg-slate-800 text-slate-100">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800">
                  <th className="border border-slate-700 p-2">Hold</th>
                  <th className="border border-slate-700 p-2">Grade</th>
                  <th className="border border-slate-700 p-2">This Shift (MT)</th>
                  <th className="border border-slate-700 p-2">Accumulated (MT)</th>
                  <th className="border border-slate-700 p-2">Remaining (MT)</th>
                </tr>
              </thead>
              <tbody>
                {holdsArray.map(hold => {
                  const selectedGrade = holdGradeMap[hold] || "";
                  const tonnage = cargoData[hold]?.[selectedGrade] || 0;
                  
                  return (
                    <tr key={hold} className="border-b border-slate-700">
                      <td className="border border-slate-700 bg-slate-900 p-2 text-center font-semibold text-slate-100">
                        {hold}
                      </td>
                      <td className="border border-slate-700 bg-slate-900 p-2 text-slate-100">
                        <div className="w-full rounded border border-slate-600 bg-slate-900 p-1 text-slate-100">
                          {selectedGrade || "-"}
                        </div>
                      </td>
                      <td className="border border-slate-700 bg-slate-900 p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={tonnage || ""}
                          onChange={(e) => {
                            if (selectedGrade) {
                              handleCargoChange(hold, selectedGrade, parseFloat(e.target.value) || 0);
                            }
                          }}
                          disabled={!selectedGrade}
                          className="w-full touch-manipulation rounded border border-slate-600 bg-slate-900 p-1 text-slate-100 disabled:bg-slate-800"
                          placeholder={selectedGrade ? "0.00" : "No grade in stow plan"}
                        />
                      </td>
                      <td
                        className={`border border-slate-700 bg-slate-900 p-2 text-center font-semibold text-slate-100 ${
                          selectedGrade && (accumulatedData[hold]?.[selectedGrade] || 0) < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {selectedGrade ? (accumulatedData[hold]?.[selectedGrade] || 0).toFixed(2) : "0.00"}
                      </td>
                      <td
                        className={`border border-slate-700 bg-slate-900 p-2 text-center font-semibold text-slate-100 ${
                          selectedGrade && (remainingData[hold]?.[selectedGrade] || 0) < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {selectedGrade ? (remainingData[hold]?.[selectedGrade] || 0).toFixed(2) : "0.00"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {operationType === "DISCHARGE" && (
            <p className="text-xs text-zinc-500 mt-2">
              For discharge operations, accumulated and balance-to-go can become negative (shown in red) when discharge exceeds stow plan basis.
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100 focus:ring-2 focus:ring-blue-500"
            rows={4}
            placeholder="Add any observations, delays, or comments..."
          />
        </div>

        {/* Email Recipients - Optional Override */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Additional Email Recipients (optional)
          </label>
          <input
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            className="w-full touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100 focus:ring-2 focus:ring-blue-500"
            placeholder="extra1@example.com, extra2@example.com"
          />
          <p className="text-xs text-slate-400 mt-1">
            ðŸ’¡ Main recipients are configured in vessel settings. Add extra recipients here if needed (comma-separated).
          </p>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="min-h-[44px] w-full rounded-lg bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Submitting..." : existingShift ? "Submit Revised Shift Report" : "Submit Shift Report"}
        </button>
      </div>
    </div>
  );
}



