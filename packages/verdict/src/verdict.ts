import type { Estimate } from "./sample";

export const verdicts = ["better", "worse", "not-conclusive"] as const;
export type Verdict = (typeof verdicts)[number];

export type Direction = "increase" | "decrease" | "none";

export function detectedDirection(options: {
  readonly estimate: Estimate;
  readonly alpha: number;
}): Direction {
  const { difference, pValue } = options.estimate;

  if (!(pValue < options.alpha)) {
    return "none";
  }

  if (difference.lower > 0) {
    return "increase";
  }

  return difference.upper < 0 ? "decrease" : "none";
}

export function decideVerdict(options: {
  readonly estimate: Estimate;
  readonly alpha: number;
  readonly higherIsBetter: boolean;
}): Verdict {
  const direction = detectedDirection(options);

  if (direction === "none") {
    return "not-conclusive";
  }

  return (direction === "increase") === options.higherIsBetter ? "better" : "worse";
}
