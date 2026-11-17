import { createPythonRandom } from "@agent-evals/statistics";
import type { Experiment } from "./spec";

export type Cell = {
  readonly task: string;
  readonly arm: string;
  readonly repeat: number;
};

export type TaskBlock = {
  readonly task: string;
  readonly cells: readonly Cell[];
};

function shuffled<Value>(options: {
  readonly values: readonly Value[];
  readonly random: () => number;
}): Value[] {
  const result = [...options.values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(options.random() * (index + 1));
    const held = result[index];
    const swapped = result[other];

    if (held !== undefined && swapped !== undefined) {
      result[index] = swapped;
      result[other] = held;
    }
  }

  return result;
}

export function buildSchedule(experiment: Experiment): readonly TaskBlock[] {
  const { random } = createPythonRandom(experiment.seed);
  const armNames = Object.keys(experiment.arms);
  const tasks = shuffled({ values: experiment.tasks.map((task) => task.id), random });

  return tasks.map((task) => ({
    task,
    cells: Array.from({ length: experiment.repeats }, (_, repeat) =>
      shuffled({ values: armNames, random }).map((arm) => ({ task, arm, repeat })),
    ).flat(),
  }));
}

export function cellKey(cell: Cell): string {
  return `${cell.task}\u0000${cell.arm}\u0000${cell.repeat}`;
}
