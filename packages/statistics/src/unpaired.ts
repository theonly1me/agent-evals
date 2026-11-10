import { defaultResampleOptions, type ResampleOptions } from "./intervals";
import { createPythonRandom, type PythonRandom } from "./mersenneTwister";
import { exactMean } from "./sums";

const comparisonTolerance = 1e-12;

function shuffled(options: { values: readonly number[]; generator: PythonRandom }): number[] {
  const result = [...options.values];
  for (let lastIndex = result.length - 1; lastIndex > 0; lastIndex -= 1) {
    const swapIndex = Math.floor(options.generator.random() * (lastIndex + 1));
    const last = result[lastIndex] ?? 0;
    result[lastIndex] = result[swapIndex] ?? 0;
    result[swapIndex] = last;
  }
  return result;
}

export function permutationPValue(options: {
  baseline: readonly number[];
  candidate: readonly number[];
  resample?: ResampleOptions;
}): number {
  const { seed, rounds } = options.resample ?? defaultResampleOptions;
  if (options.baseline.length === 0 || options.candidate.length === 0) {
    return Number.NaN;
  }
  const observed = Math.abs(exactMean(options.candidate) - exactMean(options.baseline));
  const pooled = [...options.baseline, ...options.candidate];
  const generator = createPythonRandom(seed);
  let extremeCount = 0;
  for (let round = 0; round < rounds; round += 1) {
    const mixed = shuffled({ values: pooled, generator });
    const baseline = mixed.slice(0, options.baseline.length);
    const candidate = mixed.slice(options.baseline.length);
    const difference = Math.abs(exactMean(candidate) - exactMean(baseline));
    if (difference >= observed - comparisonTolerance) {
      extremeCount += 1;
    }
  }
  return (extremeCount + 1) / (rounds + 1);
}
