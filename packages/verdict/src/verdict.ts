import type { Estimate } from "./sample";

export const verdicts = ["better", "worse", "not-conclusive"] as const;
export type Verdict = (typeof verdicts)[number];

export function decideVerdict(options: {
  readonly estimate: Estimate;
  readonly alpha: number;
  readonly higherIsBetter: boolean;
}): Verdict {
  const { difference, pValue } = options.estimate;
  const excludesZero = difference.lower > 0 || difference.upper < 0;

  if (!(pValue < options.alpha) || !excludesZero) {
    return "not-conclusive";
  }

  const isIncrease = difference.estimate > 0;

  return isIncrease === options.higherIsBetter ? "better" : "worse";
}
