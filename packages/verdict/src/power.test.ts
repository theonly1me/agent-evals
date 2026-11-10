import { expect, test } from "bun:test";
import { defaultComparisonSettings } from "./compare";
import { planPower } from "./power";

const settings = { ...defaultComparisonSettings, resample: { seed: 3, rounds: 1000 } };
const differences = [0.4, -0.2, 0.6, 0.1, 0.5, -0.1, 0.3, 0.2];

test("a target difference of zero needs an unlimited number of units", () => {
  const plan = planPower({
    sample: { unit: "task", differences },
    settings: { ...settings, targetEffect: 0 },
  });

  expect(plan.method).toBe("normal-approximation");
  expect(plan.unitsNeeded).toBe(Number.POSITIVE_INFINITY);
});

test("a small target that needs more than 60 units uses the normal approximation", () => {
  const plan = planPower({
    sample: { unit: "task", differences },
    settings: { ...settings, targetEffect: 0.05 },
  });

  expect(plan.method).toBe("normal-approximation");
  expect(plan.unitsNeeded).toBeGreaterThan(60);
  expect(plan.additionalUnits).toBe(plan.unitsNeeded - differences.length);
});

test("a large target is simulated and never asks for fewer units than the normal approximation", () => {
  const sample = { unit: "task" as const, differences };
  const simulated = planPower({ sample, settings: { ...settings, targetEffect: 0.3 } });
  const smaller = planPower({ sample, settings: { ...settings, targetEffect: 0.2 } });

  expect(simulated.method).toBe("simulation");
  expect(simulated.unitsNeeded).toBeGreaterThanOrEqual(7);
  expect(smaller.unitsNeeded).toBeGreaterThan(simulated.unitsNeeded);
}, 30_000);

test("the same sample and seed give the same plan", () => {
  const question = {
    sample: { unit: "run" as const, baseline: [0, 0, 1, 0, 1, 0], candidate: [1, 1, 1, 0, 1, 1] },
    settings: { ...settings, targetEffect: 0.5 },
  };

  const plan = planPower(question);

  expect(planPower(question)).toEqual(plan);
  expect(plan.method).toBe("simulation");
}, 30_000);
