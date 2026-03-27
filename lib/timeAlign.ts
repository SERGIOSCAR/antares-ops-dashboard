export interface ForecastPoint {
  time: Date;
  tide: number;
}

export interface AstroPoint {
  time: Date;
  tide: number;
}

function toEpoch(date: Date) {
  return date.getTime();
}

export function alignByNearestHour(
  forecast: ForecastPoint[],
  astro: AstroPoint[],
) {
  const astroSorted = [...astro].sort((a, b) => toEpoch(a.time) - toEpoch(b.time));

  return forecast.map((fc) => {
    let closest = astroSorted[0];
    let minDiff = Math.abs(toEpoch(fc.time) - toEpoch(closest.time));

    for (let i = 1; i < astroSorted.length; i += 1) {
      const diff = Math.abs(toEpoch(fc.time) - toEpoch(astroSorted[i].time));
      if (diff < minDiff) {
        minDiff = diff;
        closest = astroSorted[i];
      }
    }

    return { forecast: fc, astro: closest };
  });
}
