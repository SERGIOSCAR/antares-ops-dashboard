import Decimal from "decimal.js";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, set } from "date-fns";

export const AR_TZ = "America/Argentina/Buenos_Aires";

export function d(n: number | string) {
  return new Decimal(n || 0);
}

export function round3(n: Decimal) {
  return n.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export function toISOInTZ(date: Date) {
  return date.toISOString();
}

export function fmtLocal(iso: string, fmt = "yyyy-MM-dd HH:mm") {
  return formatInTimeZone(new Date(iso), AR_TZ, fmt);
}

export function parseShiftType(shiftType: string) {
  const parts = shiftType.split("/").map(s => s.trim());
  return parts.map(p => {
    const [a, b] = p.split("-").map(x => x.trim());
    const [sh, sm] = a.split(":").length === 2 ? a.split(":") : [a, "00"];
    const [eh, em] = b.split(":").length === 2 ? b.split(":") : [b, "00"];
    return {
      startH: Number(sh), startM: Number(sm),
      endH: Number(eh), endM: Number(em),
      label: p
    };
  });
}

export function detectCurrentShiftWindow(now: Date, shiftType: string) {
  const windows = parseShiftType(shiftType);
  const nowLocal = new Date(formatInTimeZone(now, AR_TZ, "yyyy-MM-dd'T'HH:mm:ss"));
  const y = Number(formatInTimeZone(now, AR_TZ, "yyyy"));
  const m = Number(formatInTimeZone(now, AR_TZ, "MM")) - 1;
  const day = Number(formatInTimeZone(now, AR_TZ, "dd"));

  const candidates: Array<{ start: Date; end: Date; label: string }> = [];

  for (const w of windows) {
    const startLocal = set(new Date(y, m, day), { hours: w.startH, minutes: w.startM, seconds: 0, milliseconds: 0 });
    const endLocalSameDay = set(new Date(y, m, day), { hours: w.endH, minutes: w.endM, seconds: 0, milliseconds: 0 });
    const endLocal = endLocalSameDay <= startLocal ? addDays(endLocalSameDay, 1) : endLocalSameDay;

    const startUtc = fromZonedTime(startLocal, AR_TZ);
    const endUtc = fromZonedTime(endLocal, AR_TZ);

    candidates.push({ start: startUtc, end: endUtc, label: w.label });

    const startLocalPrev = addDays(startLocal, -1);
    const endLocalPrev = addDays(endLocal, -1);
    candidates.push({
      start: fromZonedTime(startLocalPrev, AR_TZ),
      end: fromZonedTime(endLocalPrev, AR_TZ),
      label: w.label
    });
  }

  const nowUtc = now;
  const current = candidates.find(c => nowUtc >= c.start && nowUtc < c.end);
  if (!current) {
    const first = candidates.sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    return { start: first.start, end: first.end, label: first.label };
  }
  return { start: current.start, end: current.end, label: current.label };
}

export function minutesBetween(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.round((b - a) / 60000));
}