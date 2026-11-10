export function holmAdjusted(pValues: readonly number[]): number[] {
  const ordered = pValues
    .map((pValue, position) => ({ pValue, position }))
    .sort((left, right) => left.pValue - right.pValue);
  const adjusted = new Array<number>(pValues.length).fill(Number.NaN);
  let runningMaximum = 0;
  ordered.forEach((entry, rank) => {
    const scaled = Math.min(1, entry.pValue * (pValues.length - rank));
    runningMaximum = Math.max(runningMaximum, scaled);
    adjusted[entry.position] = runningMaximum;
  });
  return adjusted;
}
