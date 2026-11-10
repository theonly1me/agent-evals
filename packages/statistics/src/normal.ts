const lowerTail = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
] as const;
const lowerTailDivisor = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
] as const;
const central = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
] as const;
const centralDivisor = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
] as const;
const tailBoundary = 0.02425;

function polynomial(options: { coefficients: readonly number[]; variable: number }): number {
  return options.coefficients.reduce(
    (total, coefficient) => total * options.variable + coefficient,
    0,
  );
}

function tailQuantile(probability: number): number {
  const variable = Math.sqrt(-2 * Math.log(probability));
  return (
    polynomial({ coefficients: lowerTail, variable }) /
    polynomial({ coefficients: [...lowerTailDivisor, 1], variable })
  );
}

export function normalQuantile(probability: number): number {
  if (!(probability > 0 && probability < 1)) {
    throw new Error(`A probability must be between 0 and 1, received ${probability}.`);
  }
  if (probability < tailBoundary) {
    return tailQuantile(probability);
  }
  if (probability > 1 - tailBoundary) {
    return -tailQuantile(1 - probability);
  }
  const centered = probability - 0.5;
  const variable = centered * centered;
  return (
    (polynomial({ coefficients: central, variable }) * centered) /
    polynomial({ coefficients: [...centralDivisor, 1], variable })
  );
}
