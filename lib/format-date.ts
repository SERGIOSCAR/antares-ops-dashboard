import { format } from "date-fns";

export function formatDateTime(ts: string | Date | null | undefined) {
  if (!ts) return "-";
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return "-";
  // Show day and month only (year omitted per UI request)
  return format(parsed, "dd-MMM HH:mm");
}
