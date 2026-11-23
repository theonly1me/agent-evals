import type { Experiment } from "./spec";
import type { Attempt } from "./store";

export type StopReason =
  | "complete"
  | "run-limit"
  | "cost-limit"
  | "judge-limit"
  | "look"
  | "usage-limit";

function isLimited(attempt: Attempt): boolean {
  return attempt.limited === true;
}

export function nextAttemptOf(options: {
  readonly cellAttempts: readonly Attempt[];
  readonly retries: number;
}): number | null {
  const last = options.cellAttempts.at(-1);

  if (last === undefined) {
    return 0;
  }

  if (last.status !== "infra-failure") {
    return null;
  }

  const failures = options.cellAttempts.filter(
    (attempt) => attempt.status === "infra-failure" && !isLimited(attempt),
  ).length;

  return isLimited(last) || failures <= options.retries ? last.attempt + 1 : null;
}

export function limitReached(options: {
  readonly experiment: Experiment;
  readonly attempts: readonly Attempt[];
}): StopReason | null {
  const { experiment } = options;
  const counted = options.attempts.filter((attempt) => !isLimited(attempt));
  const cost = counted.reduce((total, attempt) => total + (attempt.costUsd ?? 0), 0);

  if (experiment.maxRuns !== undefined && counted.length >= experiment.maxRuns) {
    return "run-limit";
  }

  return experiment.maxCostUsd !== undefined && cost >= experiment.maxCostUsd ? "cost-limit" : null;
}
