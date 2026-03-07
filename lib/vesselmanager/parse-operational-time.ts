const OPERATIONAL_TIME_RE =
  /^(\d{1,2})\s?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+((?:[01]?\d|2[0-3])(?:H|HS|HRS)?|(?:[01]?\d|2[0-3]):[0-5]\d|AM|PM|NOON|EAM|EPM|LPM)$/;

const monthMap: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

const periodTokens = new Set(["AM", "PM", "NOON", "EAM", "EPM", "LPM"]);

export type ParsedOperationalInput = {
  day: number;
  monthCode: keyof typeof monthMap;
  token: string;
  minuteProvided: boolean;
  isPeriodToken: boolean;
  periodDisplay: string | null;
  parsed:
    | {
        type: "period";
        value: string;
      }
    | {
        type: "hour";
        value: string;
      };
};

export function parseOperationalInput(raw: string): ParsedOperationalInput | null {
  const value = raw.trim().toUpperCase();
  const match = value.match(OPERATIONAL_TIME_RE);
  if (!match) return null;

  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const monthCode = match[2] as ParsedOperationalInput["monthCode"];
  const token = match[3];
  const minuteProvided = token.includes(":");
  const isPeriodToken = periodTokens.has(token);
  const periodDisplay = isPeriodToken ? `${String(day).padStart(2, "0")}${monthCode} ${token}` : null;
  const parsed = isPeriodToken ? { type: "period" as const, value: token } : { type: "hour" as const, value: token };

  return { day, monthCode, token, minuteProvided, isPeriodToken, periodDisplay, parsed };
}

export function toOperationalIso(parsed: ParsedOperationalInput, reference = new Date()): string | null {
  const month = monthMap[parsed.monthCode];
  if (month === undefined) return null;

  if (parsed.parsed.type === "period") {
    return parsed.periodDisplay;
  }

  let hour = 0;
  let minute = 0;
  const numericToken = parsed.token.replace(/(H|HS|HRS)$/i, "");
  const [hh, mm] = numericToken.split(":");
  hour = Number(hh);
  minute = mm ? Number(mm) : 0;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute > 0)) {
    return null;
  }
  if (hour === 24) hour = 0;

  const dt = new Date(reference.getFullYear(), month, parsed.day, hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  // Prevent JS date rollover (e.g. 32FEB => 04MAR)
  if (dt.getMonth() !== month || dt.getDate() !== parsed.day) return null;

  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
}
