import {
  defaultResampleOptions,
  type Interval,
  percentileInterval,
  type ResampleOptions,
  signFlipPValue,
} from "./intervals";
import { createPythonRandom } from "./mersenneTwister";
import { compensatedSum, exactMean } from "./sums";

const comparisonTolerance = 1e-12;

export function pairedDifferenceInterval(options: {
  differences: readonly number[];
  resample?: ResampleOptions;
}): Interval {
  const { seed, rounds } = options.resample ?? defaultResampleOptions;
  const generator = createPythonRandom(seed);
  const { differences } = options;
  const drawn = new Float64Array(differences.length);
  const samples = Array.from({ length: rounds }, () => {
    for (let position = 0; position < drawn.length; position += 1) {
      drawn[position] = generator.choice(differences);
    }

    return exactMean(drawn);
  });
  return percentileInterval({ estimate: exactMean(differences), samples });
}

function exactSignFlipPValue(differences: readonly number[]): number {
  const observed = Math.abs(compensatedSum(differences));
  const assignmentCount = 2 ** differences.length;
  let extremeCount = 0;
  for (let assignment = 0; assignment < assignmentCount; assignment += 1) {
    const flipped = differences.map((difference, differenceIndex) =>
      (assignment >> differenceIndex) & 1 ? -difference : difference,
    );
    if (Math.abs(compensatedSum(flipped)) >= observed - comparisonTolerance) {
      extremeCount += 1;
    }
  }
  return extremeCount / assignmentCount;
}

export function pairedPValue(options: {
  differences: readonly number[];
  resample?: ResampleOptions;
}): number {
  const resample = options.resample ?? defaultResampleOptions;
  if (options.differences.length === 0) {
    return Number.NaN;
  }
  if (2 ** options.differences.length <= resample.rounds) {
    return exactSignFlipPValue(options.differences);
  }
  return signFlipPValue({ values: options.differences, center: 0, resample });
}
