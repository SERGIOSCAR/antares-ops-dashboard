export type SofDayType = "WORKING_DAY" | "WEEKEND" | "HOLIDAY" | "NON_WORKING_DAY";

const parseCsv = (value?: string) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const getDatePart = (isoLike: string) => String(isoLike || "").slice(0, 10);

const getSofConfig = () => {
  const holidays = new Set(parseCsv(process.env.SOF_HOLIDAYS));
  const nonWorkingDates = new Set(parseCsv(process.env.SOF_NON_WORKING_DATES));
  const nonWorkingWeekdays = new Set(
    parseCsv(process.env.SOF_NON_WORKING_WEEKDAYS)
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
  );

  return { holidays, nonWorkingDates, nonWorkingWeekdays };
};

export function classifySofDay(isoLike: string): SofDayType {
  const datePart = getDatePart(isoLike);
  const { holidays, nonWorkingDates, nonWorkingWeekdays } = getSofConfig();

  if (holidays.has(datePart)) return "HOLIDAY";
  if (nonWorkingDates.has(datePart)) return "NON_WORKING_DAY";

  const dt = new Date(`${datePart}T00:00:00`);
  const day = dt.getDay();

  if (nonWorkingWeekdays.has(day)) return "NON_WORKING_DAY";
  if (day === 0 || day === 6) return "WEEKEND";
  return "WORKING_DAY";
}

export function sofDayLabel(dayType: SofDayType) {
  if (dayType === "HOLIDAY") return "Holiday";
  if (dayType === "NON_WORKING_DAY") return "Non-Working Day";
  if (dayType === "WEEKEND") return "Weekend";
  return "Working Day";
}
