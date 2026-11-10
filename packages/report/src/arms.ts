import type { RunRecord } from "@agent-evals/records";
import { exactMean, exactSum } from "@agent-evals/statistics";

export type ArmSummary = {
  readonly arm: string;
  readonly runs: number;
  readonly completed: number;
  readonly timeouts: number;
  readonly failures: number;
  readonly meanDurationSeconds: number | null;
  readonly totalCostUsd: number | null;
};

function defined(values: readonly (number | undefined)[]): number[] {
  return values.filter((value) => value !== undefined);
}

export function summarizeArm(options: {
  readonly records: readonly RunRecord[];
  readonly arm: string;
}): ArmSummary {
  const runs = options.records.filter((record) => record.arm === options.arm);
  const countOf = (status: RunRecord["status"]) =>
    runs.filter((record) => record.status === status).length;
  const durations = defined(runs.map((record) => record.durationSeconds));
  const costs = defined(runs.map((record) => record.costUsd));

  return {
    arm: options.arm,
    runs: runs.length,
    completed: countOf("completed"),
    timeouts: countOf("timeout"),
    failures: countOf("infra-failure"),
    meanDurationSeconds: durations.length === 0 ? null : exactMean(durations),
    totalCostUsd: costs.length === 0 ? null : exactSum(costs),
  };
}
