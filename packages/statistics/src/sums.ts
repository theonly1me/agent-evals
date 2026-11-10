function addPartial(options: { partials: number[]; value: number }): void {
  let carried = options.value;
  let kept = 0;
  for (const partial of options.partials) {
    const larger = Math.abs(carried) < Math.abs(partial) ? partial : carried;
    const smaller = larger === partial ? carried : partial;
    const high = larger + smaller;
    const low = smaller - (high - larger);
    if (low !== 0) {
      options.partials[kept] = low;
      kept += 1;
    }
    carried = high;
  }
  options.partials.length = kept;
  options.partials.push(carried);
}

function roundPartials(partials: readonly number[]): number {
  let remaining = partials.length;
  if (remaining === 0) {
    return 0;
  }
  remaining -= 1;
  let high = partials[remaining] ?? 0;
  let low = 0;
  while (remaining > 0) {
    const previousHigh = high;
    remaining -= 1;
    const next = partials[remaining] ?? 0;
    high = previousHigh + next;
    low = next - (high - previousHigh);
    if (low !== 0) {
      break;
    }
  }
  const below = remaining > 0 ? (partials[remaining - 1] ?? 0) : 0;
  const isSameDirection = (low < 0 && below < 0) || (low > 0 && below > 0);
  if (isSameDirection) {
    const doubled = low * 2;
    const rounded = high + doubled;
    if (doubled === rounded - high) {
      return rounded;
    }
  }
  return high;
}

export function exactSum(values: ArrayLike<number> & Iterable<number>): number {
  const partials: number[] = [];
  for (const value of values) {
    addPartial({ partials, value });
  }
  return roundPartials(partials);
}

export function exactMean(values: ArrayLike<number> & Iterable<number>): number {
  return values.length === 0 ? Number.NaN : exactSum(values) / values.length;
}

export function compensatedSum(values: Iterable<number>): number {
  let total = 0;
  let compensation = 0;
  for (const value of values) {
    const next = total + value;
    compensation +=
      Math.abs(total) >= Math.abs(value) ? total - next + value : value - next + total;
    total = next;
  }
  return Number.isFinite(compensation) ? total + compensation : total;
}
