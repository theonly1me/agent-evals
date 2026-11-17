import { expect, test } from "bun:test";
import type { RunRecord } from "@agent-evals/records";
import { createPythonRandom } from "@agent-evals/statistics";
import { compareArms, defaultComparisonSettings } from "@agent-evals/verdict";
import { analysisAlpha, analysisCount, lookDecision } from "./looks";

const taskCount = 24;
const repeatCount = 3;
const looks = [8, 16];
const emptyArm = { files: {}, home: {}, env: {}, flags: [] };
const design = {
  looks,
  tasks: Array.from({ length: taskCount }, (_, index) => ({ id: `task-${index}` })),
  lowerIsBetter: false,
  arms: { baseline: emptyArm, candidate: emptyArm },
  baseline: "baseline",
  metric: "passed",
};
const fastResample = { seed: 7, rounds: 1000 };

function experimentRecords(options: {
  readonly random: () => number;
  readonly effect: number;
}): RunRecord[] {
  return design.tasks.flatMap((task) => {
    const rate = 0.2 + 0.5 * options.random();

    return ["baseline", "candidate"].flatMap((arm) =>
      Array.from({ length: repeatCount }, (_, repeat) => ({
        task: task.id,
        arm,
        repeat,
        status: "completed" as const,
        scores: {
          passed: options.random() < rate + (arm === "candidate" ? options.effect : 0) ? 1 : 0,
        },
      })),
    );
  });
}

function firstTasks(options: { readonly records: readonly RunRecord[]; readonly count: number }) {
  const kept = new Set(design.tasks.slice(0, options.count).map((task) => task.id));

  return options.records.filter((record) => kept.has(record.task));
}

function isConclusive(options: { readonly records: readonly RunRecord[]; readonly alpha: number }) {
  const comparison = compareArms({
    records: options.records,
    arms: { baseline: "baseline", candidate: "candidate" },
    metric: "passed",
    settings: { ...defaultComparisonSettings, alpha: options.alpha, resample: fastResample },
  });

  return comparison !== "no-shared-task" && comparison.verdict !== "not-conclusive";
}

test("each analysis gets an equal part of the 5% level, and a look at the last task is not a look", () => {
  expect(analysisCount(design)).toBe(3);
  expect(analysisAlpha(design)).toBeCloseTo(0.05 / 3, 12);
  expect(analysisCount({ ...design, looks: [8, 16, 24] })).toBe(3);
  expect(analysisAlpha({ ...design, looks: [] })).toBe(0.05);
});

test("a look stops on a large effect and continues when the arms are equal", () => {
  const { random } = createPythonRandom(11);
  const large = experimentRecords({ random, effect: 0.45 });
  const equal = experimentRecords({ random, effect: 0 });

  expect(
    lookDecision({ experiment: design, records: firstTasks({ records: large, count: 16 }) }),
  ).toBe("stop");
  expect(
    lookDecision({ experiment: design, records: firstTasks({ records: equal, count: 16 }) }),
  ).toBe("continue");
});

test("with two looks and no true effect, the stop rule gives a false verdict in at most 5% of experiments", () => {
  const { random } = createPythonRandom(20261118);
  const experimentCount = 400;
  const analyses = [...looks, taskCount];
  let splitFalse = 0;
  let naiveFalse = 0;

  for (let index = 0; index < experimentCount; index += 1) {
    const records = experimentRecords({ random, effect: 0 });
    const conclusiveAt = (alpha: number) =>
      analyses.some((count) => isConclusive({ records: firstTasks({ records, count }), alpha }));

    splitFalse += conclusiveAt(analysisAlpha(design)) ? 1 : 0;
    naiveFalse += conclusiveAt(0.05) ? 1 : 0;
  }

  expect(splitFalse / experimentCount).toBeLessThanOrEqual(0.05);
  expect(naiveFalse).toBeGreaterThan(splitFalse);
}, 120_000);
