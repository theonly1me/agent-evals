import { expect, test } from "bun:test";
import { buildSchedule, cellKey } from "./schedule";
import { type Experiment, loadExperiment } from "./spec";
import { writeSampleExperiment } from "./testing/sample";

const taskIds = Array.from({ length: 12 }, (_, index) => `task-${index}`);

async function experimentWith(spec: Record<string, unknown>): Promise<Experiment> {
  const result = await loadExperiment(await writeSampleExperiment({ tasks: taskIds, spec }));

  if (result.status === "rejected") {
    throw new Error(result.problem);
  }

  return result.experiment;
}

test("the schedule holds each cell one time, with all the cells of a task together", async () => {
  const blocks = buildSchedule(await experimentWith({ repeats: 3 }));
  const cells = blocks.flatMap((block) => block.cells);

  expect(new Set(cells.map(cellKey)).size).toBe(12 * 2 * 3);
  expect(cells).toHaveLength(12 * 2 * 3);
  expect(blocks.map((block) => block.task).sort()).toEqual([...taskIds].sort());
  expect(blocks.every((block) => block.cells.every((cell) => cell.task === block.task))).toBe(true);
});

test("each arm runs first in some pairs, so the order cannot favor one arm", async () => {
  const blocks = buildSchedule(await experimentWith({ repeats: 3 }));
  const firstArms = blocks.flatMap((block) =>
    block.cells.filter((_, index) => index % 2 === 0).map((cell) => cell.arm),
  );
  const plainFirst = firstArms.filter((arm) => arm === "plain").length;

  expect(firstArms).toHaveLength(36);
  expect(plainFirst).toBeGreaterThan(9);
  expect(plainFirst).toBeLessThan(27);
});

test("the same seed gives the same schedule, and a different seed gives a different one", async () => {
  const first = buildSchedule(await experimentWith({ seed: 7 }));
  const again = buildSchedule(await experimentWith({ seed: 7 }));
  const other = buildSchedule(await experimentWith({ seed: 8 }));

  expect(again).toEqual(first);
  expect(other.map((block) => block.task)).not.toEqual(first.map((block) => block.task));
  expect(first.map((block) => block.task)).not.toEqual(taskIds);
});
