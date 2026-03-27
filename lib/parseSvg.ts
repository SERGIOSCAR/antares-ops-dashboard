interface ParsedSvg {
  times: Date[];
  tides: number[];
}

/**
 * Extract forecast points from the SHN pygal SVG.
 * It reads <circle> elements and their nested <desc class="value"> (height meters)
 * plus <desc class="x_label"> (dd-MM| HH:mm).
 */
export function parseForecastSvg(svg: string): ParsedSvg {
  const times: Date[] = [];
  const tides: number[] = [];

  // Try to infer base year from the title e.g. "Inicializado 2026/03/20 ..."
  const yearMatch = svg.match(/Inicializado\s+(\d{4})/);
  const baseYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  const circleRegex =
    /<circle[^>]*class="dot[^"]*"[^>]*>(?:[\s\S]*?<desc class="value">([\d.,-]+)<\/desc>[\s\S]*?<desc class="x_label">([^<]+)<\/desc>)[\s\S]*?<\/g>/gi;

  let match: RegExpExecArray | null;
  while ((match = circleRegex.exec(svg)) !== null) {
    const [, valueRaw, labelRaw] = match;
    const tide = Number.parseFloat(valueRaw.replace(",", "."));

    const label = labelRaw.trim(); // format: 20-03| 03:00 (HOA)
    const [datePart, timePart] = label.split("|").map((s) => s.trim());
    const [dayStr, monthStr] = datePart.split("-").map((s) => s.trim());
    const [hourStr, minuteStr] = timePart.split(":");

    const day = Number(dayStr);
    const month = Number(monthStr); // 1-12
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if ([day, month, hour, minute].some((n) => Number.isNaN(n))) continue;

    // HOA is UTC-3; build ISO string with offset to keep ordering correct.
    const iso = `${baseYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;
    const time = new Date(iso);

    if (!Number.isFinite(tide) || Number.isNaN(time.getTime())) continue;

    tides.push(Number(tide.toFixed(2)));
    times.push(time);
  }

  return { times, tides };
}
