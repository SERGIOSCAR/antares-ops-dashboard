const BASE_DEPTH = 10.4;

// Tide (m) -> Draft (m) at base depth 10.40, from provided reference table.
const TIDE_TO_DRAFT_1040: Array<[number, number]> = [
  [-0.1, 9.70],
  [0.0, 9.80],
  [0.1, 9.90],
  [0.2, 10.0],
  [0.3, 10.10],
  [0.4, 10.20],
  [0.5, 10.30],
  [0.6, 10.37],
  [0.7, 10.41],
  [0.8, 10.45],
  [0.9, 10.49],
  [1.0, 10.53],
  [1.1, 10.57],
  [1.2, 10.61],
  [1.3, 10.65],
  [1.4, 10.73],
  [1.5, 10.82],
  [1.6, 10.91],
  [1.7, 11.00],
  [1.8, 11.09],
  [1.9, 11.18],
  [2.0, 11.27],
  [2.1, 11.36],
  [2.2, 11.45],
  [2.3, 11.54],
  [2.4, 11.63],
  [2.5, 11.72],
  [2.6, 11.81],
];

function interpolateDraft(tide: number): number {
  const sorted = [...TIDE_TO_DRAFT_1040].sort((a, b) => a[0] - b[0]);
  if (tide <= sorted[0][0]) {
    const [t1, d1] = sorted[0];
    const [t2, d2] = sorted[1];
    const slope = (d2 - d1) / (t2 - t1);
    return d1 + slope * (tide - t1);
  }
  if (tide >= sorted[sorted.length - 1][0]) {
    const [t1, d1] = sorted[sorted.length - 2];
    const [t2, d2] = sorted[sorted.length - 1];
    const slope = (d2 - d1) / (t2 - t1);
    return d1 + slope * (tide - t1);
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const [t1, d1] = sorted[i];
    const [t2, d2] = sorted[i + 1];
    if (t1 <= tide && tide <= t2) {
      const slope = (d2 - d1) / (t2 - t1);
      return d1 + slope * (tide - t1);
    }
  }
  return sorted[0][1];
}

export function tideToDraft(tide: number, depth: number) {
  const baseDraft = interpolateDraft(tide);
  const adjustedDraft = baseDraft + (depth - BASE_DEPTH);
  return {
    snappedTide: Number(tide.toFixed(2)),
    draft: Number(adjustedDraft.toFixed(3)),
  };
}
