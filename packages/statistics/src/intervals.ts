import { createPythonRandom } from "./mersenneTwister";
import { compensatedSum, exactMean } from "./sums";

export type Interval = {
  readonly estimate: number;
  readonly lower: number;
  readonly upper: number;
};

export type ResampleOptions = {
  readonly seed: number;
  readonly rounds: number;
};

export const defaultResampleOptions: ResampleOptions = {
  seed: 20261007,
  rounds: 10000,
};

const emptyInterval: Interval = {
  estimate: Number.NaN,
  lower: Number.NaN,
  upper: Number.NaN,
};
const comparisonTolerance = 1e-12;

function valueAt(options: { values: readonly number[]; index: number }): number {
  return options.values[options.index] ?? Number.NaN;
}

export function percentileInterval(options: { estimate: number; samples: number[] }): Interval {
  const sorted = options.samples.sort((left, right) => left - right);
  return {
    estimate: options.estimate,
    lower: valueAt({ values: sorted, index: Math.floor(0.025 * sorted.length) }),
    upper: valueAt({ values: sorted, index: Math.floor(0.975 * sorted.length) }),
  };
}

function createMeanResampler(choose: (values: readonly number[]) => number) {
  const buffers = new Map<number, Float64Array>();

  return (values: readonly number[]): number => {
    const drawn = buffers.get(values.length) ?? new Float64Array(values.length);

    buffers.set(values.length, drawn);

    for (let position = 0; position < values.length; position += 1) {
      drawn[position] = choose(values);
    }

    return exactMean(drawn);
  };
}

export function meanInterval(options: {
  values: readonly number[];
  resample?: ResampleOptions;
}): Interval {
  const { seed, rounds } = options.resample ?? defaultResampleOptions;
  if (options.values.length === 0) {
    return emptyInterval;
  }
  const generator = createPythonRandom(seed);
  const resampledMean = createMeanResampler(generator.choice);
  const samples = Array.from({ length: rounds }, () => resampledMean(options.values));
  return percentileInterval({ estimate: exactMean(options.values), samples });
}

export function differenceInterval(options: {
  baseline: readonly number[];
  candidate: readonly number[];
  resample?: ResampleOptions;
}): Interval {
  const { seed, rounds } = options.resample ?? defaultResampleOptions;
  if (options.baseline.length === 0 || options.candidate.length === 0) {
    return emptyInterval;
  }
  const generator = createPythonRandom(seed);
  const resampledMean = createMeanResampler(generator.choice);
  const samples = Array.from({ length: rounds }, () => {
    const candidate = resampledMean(options.candidate);
    const baseline = resampledMean(options.baseline);

    return candidate - baseline;
  });
  const estimate = exactMean(options.candidate) - exactMean(options.baseline);
  return percentileInterval({ estimate, samples });
}

export function signFlipPValue(options: {
  values: readonly number[];
  center: number;
  resample?: ResampleOptions;
}): number {
  const { seed, rounds } = options.resample ?? defaultResampleOptions;
  if (options.values.length === 0) {
    return Number.NaN;
  }
  const deviations = options.values.map((value) => value - options.center);
  const observed = Math.abs(compensatedSum(deviations));
  const generator = createPythonRandom(seed);
  let extremeCount = 0;
  const flipped = new Float64Array(deviations.length);

  for (let round = 0; round < rounds; round += 1) {
    for (const [position, deviation] of deviations.entries()) {
      flipped[position] = generator.random() < 0.5 ? deviation : -deviation;
    }

    if (Math.abs(compensatedSum(flipped)) >= observed - comparisonTolerance) {
      extremeCount += 1;
    }
  }

  return (extremeCount + 1) / (rounds + 1);
}
