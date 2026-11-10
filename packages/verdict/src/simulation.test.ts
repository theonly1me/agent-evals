import { expect, test } from "bun:test";
import { createPythonRandom } from "@agent-evals/statistics";
import { compareArms } from "./compare";
import { planPower } from "./power";
import { simulateExperiment, simulateVerdicts } from "./simulation";

const resample = { seed: 7, rounds: 1000 };
const arms = { baseline: "baseline", candidate: "candidate" };

test("with no true difference, at most 5% of 2,000 experiments get a verdict", () => {
  const counts = simulateVerdicts({
    design: { taskCount: 20, repeatCount: 3, trueEffect: 0 },
    experimentCount: 2000,
    seed: 13,
    resample,
  });
  expect((counts.better + counts.worse) / 2000).toBeLessThanOrEqual(0.05);
}, 60000);

test("an experiment sized by the power answer finds a true difference 80% of the time", () => {
  const trueEffect = 0.2;
  const settings = {
    alpha: 0.05,
    power: 0.8,
    higherIsBetter: true,
    targetEffect: trueEffect,
    resample,
  };
  const pilot = compareArms({
    records: simulateExperiment({
      generator: createPythonRandom(21),
      design: { taskCount: 200, repeatCount: 3, trueEffect },
    }),
    arms,
    metric: "passed",
    settings,
  });
  if (pilot === "no-shared-task") {
    throw new Error("The pilot has no shared task.");
  }

  const plan = planPower({ sample: pilot.sample, settings });
  const counts = simulateVerdicts({
    design: { taskCount: plan.unitsNeeded, repeatCount: 3, trueEffect },
    experimentCount: 500,
    seed: 22,
    resample,
  });
  expect(plan.method).toBe("simulation");
  expect(plan.unitsNeeded).toBeGreaterThan(20);
  expect(counts.worse).toBe(0);
  expect(counts.better / 500).toBeGreaterThanOrEqual(0.8);
}, 60000);
