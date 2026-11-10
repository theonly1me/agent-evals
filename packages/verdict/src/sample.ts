import {
  differenceInterval,
  exactMean,
  type Interval,
  pairedDifferenceInterval,
  pairedPValue,
  permutationPValue,
  type PythonRandom,
  type ResampleOptions,
  sampleVariance,
} from "@agent-evals/statistics";

export type UnitSample =
  | { readonly unit: "task"; readonly differences: readonly number[] }
  | {
      readonly unit: "run";
      readonly baseline: readonly number[];
      readonly candidate: readonly number[];
    };

export type Estimate = {
  readonly difference: Interval;
  readonly pValue: number;
};

export function unitCountOf(sample: UnitSample): number {
  return sample.unit === "task"
    ? sample.differences.length
    : Math.min(sample.baseline.length, sample.candidate.length);
}

export function observedEffectOf(sample: UnitSample): number {
  return sample.unit === "task"
    ? exactMean(sample.differences)
    : exactMean(sample.candidate) - exactMean(sample.baseline);
}

export function unitVarianceOf(sample: UnitSample): number {
  return sample.unit === "task"
    ? sampleVariance(sample.differences)
    : sampleVariance(sample.baseline) + sampleVariance(sample.candidate);
}

export function estimateOf(options: {
  readonly sample: UnitSample;
  readonly resample: ResampleOptions;
}): Estimate {
  const { sample, resample } = options;

  if (sample.unit === "task") {
    const { differences } = sample;

    return {
      difference: pairedDifferenceInterval({ differences, resample }),
      pValue: pairedPValue({ differences, resample }),
    };
  }

  const { baseline, candidate } = sample;

  return {
    difference: differenceInterval({ baseline, candidate, resample }),
    pValue: permutationPValue({ baseline, candidate, resample }),
  };
}

function drawn(options: {
  readonly values: readonly number[];
  readonly count: number;
  readonly shift: number;
  readonly generator: PythonRandom;
}): number[] {
  return Array.from(
    { length: options.count },
    () => options.generator.choice(options.values) + options.shift,
  );
}

export function redrawnSample(options: {
  readonly sample: UnitSample;
  readonly unitCount: number;
  readonly effect: number;
  readonly generator: PythonRandom;
}): UnitSample {
  const { sample, generator } = options;
  const count = options.unitCount;
  const shift = options.effect - observedEffectOf(sample);

  if (sample.unit === "task") {
    return {
      unit: "task",
      differences: drawn({ values: sample.differences, count, shift, generator }),
    };
  }

  return {
    unit: "run",
    baseline: drawn({ values: sample.baseline, count, shift: 0, generator }),
    candidate: drawn({ values: sample.candidate, count, shift, generator }),
  };
}
