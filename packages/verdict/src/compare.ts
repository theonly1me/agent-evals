import type { RunRecord } from "@agent-evals/records";
import {
  defaultResampleOptions,
  exactMean,
  type Interval,
  type ResampleOptions,
} from "@agent-evals/statistics";
import { type ArmPair, matchCells, type TaskCell, taskDifferences } from "./cells";
import { estimateOf, unitCountOf, type UnitSample } from "./sample";
import { decideVerdict, type Verdict } from "./verdict";

export type ComparisonSettings = {
  readonly alpha: number;
  readonly power: number;
  readonly higherIsBetter: boolean;
  readonly targetEffect?: number;
  readonly resample: ResampleOptions;
};

export const defaultComparisonSettings: ComparisonSettings = {
  alpha: 0.05,
  power: 0.8,
  higherIsBetter: true,
  resample: defaultResampleOptions,
};

export type Comparison = {
  readonly metric: string;
  readonly arms: ArmPair;
  readonly sample: UnitSample;
  readonly unitCount: number;
  readonly baselineMean: number;
  readonly candidateMean: number;
  readonly difference: Interval;
  readonly pValue: number;
  readonly verdict: Verdict;
  readonly tasksOnlyInBaseline: readonly string[];
  readonly tasksOnlyInCandidate: readonly string[];
};

function sampleOf(cells: readonly [TaskCell, ...TaskCell[]]): UnitSample {
  const [firstCell, ...otherCells] = cells;

  return otherCells.length === 0
    ? { unit: "run", baseline: firstCell.baseline, candidate: firstCell.candidate }
    : { unit: "task", differences: taskDifferences(cells) };
}

export function compareArms(options: {
  readonly records: readonly RunRecord[];
  readonly arms: ArmPair;
  readonly metric: string;
  readonly settings?: ComparisonSettings;
}): Comparison | "no-shared-task" {
  const settings = options.settings ?? defaultComparisonSettings;
  const matched = matchCells(options);
  const [firstCell, ...otherCells] = matched.cells;

  if (!firstCell) {
    return "no-shared-task";
  }

  const sample = sampleOf([firstCell, ...otherCells]);
  const estimate = estimateOf({ sample, resample: settings.resample });

  return {
    metric: options.metric,
    arms: options.arms,
    sample,
    unitCount: unitCountOf(sample),
    baselineMean: exactMean(matched.cells.map((cell) => exactMean(cell.baseline))),
    candidateMean: exactMean(matched.cells.map((cell) => exactMean(cell.candidate))),
    difference: estimate.difference,
    pValue: estimate.pValue,
    verdict: decideVerdict({
      estimate,
      alpha: settings.alpha,
      higherIsBetter: settings.higherIsBetter,
    }),
    tasksOnlyInBaseline: matched.tasksOnlyInBaseline,
    tasksOnlyInCandidate: matched.tasksOnlyInCandidate,
  };
}
