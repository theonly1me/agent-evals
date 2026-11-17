import type { RunRecord } from "@agent-evals/records";
import {
  type ComparisonSettings,
  compareArms,
  defaultComparisonSettings,
} from "@agent-evals/verdict";
import { significanceLevel } from "./lock";
import type { Experiment } from "./spec";

export type LookDecision = "continue" | "stop";

type Design = Pick<
  Experiment,
  "looks" | "tasks" | "lowerIsBetter" | "arms" | "baseline" | "metric"
>;

export function analysisCount(design: Pick<Experiment, "looks" | "tasks">): number {
  return design.looks.filter((look) => look < design.tasks.length).length + 1;
}

export function analysisAlpha(design: Pick<Experiment, "looks" | "tasks">): number {
  return significanceLevel / analysisCount(design);
}

export function comparisonSettingsOf(design: Design): ComparisonSettings {
  return {
    ...defaultComparisonSettings,
    alpha: analysisAlpha(design),
    higherIsBetter: !design.lowerIsBetter,
  };
}

export function candidatesOf(design: Pick<Experiment, "arms" | "baseline">): readonly string[] {
  return Object.keys(design.arms).filter((arm) => arm !== design.baseline);
}

export function lookDecision(options: {
  readonly experiment: Design;
  readonly records: readonly RunRecord[];
}): LookDecision {
  const { experiment, records } = options;
  const settings = comparisonSettingsOf(experiment);
  const conclusive = candidatesOf(experiment).every((candidate) => {
    const comparison = compareArms({
      records,
      arms: { baseline: experiment.baseline, candidate },
      metric: experiment.metric,
      settings,
    });

    return comparison !== "no-shared-task" && comparison.verdict !== "not-conclusive";
  });

  return conclusive ? "stop" : "continue";
}
