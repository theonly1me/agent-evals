import type { RunRecord } from "@agent-evals/records";
import {
  createPythonRandom,
  type PythonRandom,
  type ResampleOptions,
} from "@agent-evals/statistics";
import { compareArms, defaultComparisonSettings } from "./compare";
import type { Verdict } from "./verdict";

export type SimulationDesign = {
  readonly taskCount: number;
  readonly repeatCount: number;
  readonly trueEffect: number;
};

export type SimulationResult = Record<Verdict, number>;

const simulatedMetric = "passed";
const simulatedArms = { baseline: "baseline", candidate: "candidate" };

function simulatedRuns(options: {
  generator: PythonRandom;
  design: SimulationDesign;
  task: string;
}): RunRecord[] {
  const { generator, design, task } = options;
  const baselineRate = 0.2 + 0.5 * generator.random();
  const rates = [
    { arm: simulatedArms.baseline, rate: baselineRate },
    { arm: simulatedArms.candidate, rate: baselineRate + design.trueEffect },
  ];
  return rates.flatMap(({ arm, rate }) =>
    Array.from({ length: design.repeatCount }, (_unused, repeat) => ({
      task,
      arm,
      repeat,
      status: "completed" as const,
      scores: { [simulatedMetric]: generator.random() < rate ? 1 : 0 },
    })),
  );
}

export function simulateExperiment(options: {
  generator: PythonRandom;
  design: SimulationDesign;
}): RunRecord[] {
  return Array.from({ length: options.design.taskCount }, (_unused, taskIndex) =>
    simulatedRuns({ ...options, task: `task-${taskIndex}` }),
  ).flat();
}

export function simulateVerdicts(options: {
  design: SimulationDesign;
  experimentCount: number;
  seed: number;
  resample: ResampleOptions;
}): SimulationResult {
  const generator = createPythonRandom(options.seed);
  const counts = { better: 0, worse: 0, "not-conclusive": 0 };
  for (let experiment = 0; experiment < options.experimentCount; experiment += 1) {
    const comparison = compareArms({
      records: simulateExperiment({ generator, design: options.design }),
      arms: simulatedArms,
      metric: simulatedMetric,
      settings: { ...defaultComparisonSettings, resample: options.resample },
    });
    if (comparison === "no-shared-task") {
      throw new Error("A simulated experiment has no shared task.");
    }

    counts[comparison.verdict] += 1;
  }
  return counts;
}
