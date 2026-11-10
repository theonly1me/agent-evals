import { normalQuantile } from "./normal";
import { exactMean } from "./sums";

export type PowerAnswer = {
  readonly targetEffect: number;
  readonly minimumDetectableEffect: number;
  readonly unitsNeeded: number;
  readonly additionalUnits: number;
};

export type PowerSettings = {
  readonly alpha: number;
  readonly power: number;
};

export function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) {
    return Number.NaN;
  }
  const mean = exactMean(values);
  const squares = values.map((value) => (value - mean) ** 2);
  return (exactMean(squares) * values.length) / (values.length - 1);
}

export function powerAnswer(options: {
  unitVariance: number;
  unitCount: number;
  targetEffect: number;
  settings: PowerSettings;
}): PowerAnswer {
  const quantileSum =
    normalQuantile(1 - options.settings.alpha / 2) + normalQuantile(options.settings.power);
  const spread = Math.sqrt(options.unitVariance);
  const targetEffect = Math.abs(options.targetEffect);
  const unitsNeeded =
    targetEffect === 0
      ? Number.POSITIVE_INFINITY
      : Math.max(2, Math.ceil(((quantileSum * spread) / targetEffect) ** 2));
  return {
    targetEffect,
    minimumDetectableEffect: (quantileSum * spread) / Math.sqrt(options.unitCount),
    unitsNeeded,
    additionalUnits: Math.max(0, unitsNeeded - options.unitCount),
  };
}
