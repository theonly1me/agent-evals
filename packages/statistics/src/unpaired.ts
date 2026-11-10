import { defaultResampleOptions, type ResampleOptions } from "./intervals";
import { createPythonRandom, type PythonRandom } from "./mersenneTwister";
import { compensatedSum, exactMean } from "./sums";

const comparisonTolerance = 1e-12;

function shuffle(options: {
  readonly values: Float64Array;
  readonly generator: PythonRandom;
}): void {
  const { values, generator } = options;

  for (let lastIndex = values.length - 1; lastIndex > 0; lastIndex -= 1) {
    const swapIndex = Math.floor(generator.random() * (lastIndex + 1));
    const last = values[lastIndex] ?? 0;

    values[lastIndex] = values[swapIndex] ?? 0;
    values[swapIndex] = last;
  }
}

export function permutationPValue(options: {
  baseline: readonly number[];
  candidate: readonly number[];
  resample?: ResampleOptions;
}): number {
  const { seed, rounds } = options.resample ?? defaultResampleOptions;
  const baselineCount = options.baseline.length;
  const candidateCount = options.candidate.length;

  if (baselineCount === 0 || candidateCount === 0) {
    return Number.NaN;
  }

  const observed = Math.abs(exactMean(options.candidate) - exactMean(options.baseline));
  const mixed = Float64Array.from([...options.baseline, ...options.candidate]);
  const total = compensatedSum(mixed);
  const generator = createPythonRandom(seed);
  let extremeCount = 0;

  for (let round = 0; round < rounds; round += 1) {
    shuffle({ values: mixed, generator });

    const baselineSum = compensatedSum(mixed.subarray(0, baselineCount));
    const difference = Math.abs(
      (total - baselineSum) / candidateCount - baselineSum / baselineCount,
    );

    if (difference >= observed - comparisonTolerance) {
      extremeCount += 1;
    }
  }

  return (extremeCount + 1) / (rounds + 1);
}
