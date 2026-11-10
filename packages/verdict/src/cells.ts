import { isScored, type RunRecord } from "@agent-evals/records";
import { exactMean } from "@agent-evals/statistics";

export type TaskCell = {
  readonly task: string;
  readonly baseline: readonly number[];
  readonly candidate: readonly number[];
};

export function taskDifferences(cells: readonly TaskCell[]): number[] {
  return cells.map((cell) => exactMean(cell.candidate) - exactMean(cell.baseline));
}

export type ArmPair = {
  readonly baseline: string;
  readonly candidate: string;
};

export type MatchedCells = {
  readonly cells: readonly TaskCell[];
  readonly tasksOnlyInBaseline: readonly string[];
  readonly tasksOnlyInCandidate: readonly string[];
};

function scoresByTask(options: {
  records: readonly RunRecord[];
  arm: string;
  metric: string;
}): Map<string, number[]> {
  const grouped = new Map<string, number[]>();
  for (const record of options.records) {
    const score = record.scores[options.metric];
    const isCounted =
      record.arm === options.arm &&
      score !== undefined &&
      isScored({ record, metric: options.metric });
    if (isCounted) {
      grouped.set(record.task, [...(grouped.get(record.task) ?? []), score]);
    }
  }
  return grouped;
}

export function matchCells(options: {
  records: readonly RunRecord[];
  arms: ArmPair;
  metric: string;
}): MatchedCells {
  const { records, metric } = options;
  const baseline = scoresByTask({ records, arm: options.arms.baseline, metric });
  const candidate = scoresByTask({ records, arm: options.arms.candidate, metric });
  const cells = [...baseline.entries()]
    .flatMap(([task, baselineScores]) => {
      const candidateScores = candidate.get(task);
      return candidateScores
        ? [{ task, baseline: baselineScores, candidate: candidateScores }]
        : [];
    })
    .sort((left, right) => left.task.localeCompare(right.task));
  return {
    cells,
    tasksOnlyInBaseline: [...baseline.keys()].filter((task) => !candidate.has(task)).sort(),
    tasksOnlyInCandidate: [...candidate.keys()].filter((task) => !baseline.has(task)).sort(),
  };
}
