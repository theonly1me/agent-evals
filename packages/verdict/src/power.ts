import { createPythonRandom, powerAnswer } from "@agent-evals/statistics";
import type { ComparisonSettings } from "./compare";
import {
  estimateOf,
  observedEffectOf,
  redrawnSample,
  unitCountOf,
  unitVarianceOf,
  type UnitSample,
} from "./sample";
import { decideVerdict } from "./verdict";

export type PowerPlan = {
  readonly method: "simulation" | "normal-approximation";
  readonly targetEffect: number;
  readonly unitsNeeded: number;
  readonly additionalUnits: number;
  readonly minimumDetectableEffect: number;
};

const simulatedExperimentCount = 300;
const simulatedRounds = 400;
const largestSimulatedUnitCount = 60;
const smallestUnitCount = 2;
const safetyMargin = 2;

type PowerQuestion = {
  readonly sample: UnitSample;
  readonly settings: ComparisonSettings;
};

function simulatedPower(
  options: PowerQuestion & { readonly unitCount: number; readonly effect: number },
): number {
  const { sample, settings, unitCount, effect } = options;
  const generator = createPythonRandom(settings.resample.seed);
  const resample = { seed: settings.resample.seed, rounds: simulatedRounds };
  let detectedCount = 0;

  for (let experiment = 0; experiment < simulatedExperimentCount; experiment += 1) {
    const redrawn = redrawnSample({ sample, unitCount, effect, generator });
    const verdict = decideVerdict({
      estimate: estimateOf({ sample: redrawn, resample }),
      alpha: settings.alpha,
      higherIsBetter: true,
    });

    if (verdict === (effect > 0 ? "better" : "worse")) {
      detectedCount += 1;
    }
  }

  return detectedCount / simulatedExperimentCount;
}

function smallestPassingCount(options: {
  readonly failing: number;
  readonly passing: number;
  readonly passes: (unitCount: number) => boolean;
}): number {
  let { failing, passing } = options;

  while (passing - failing > 1) {
    const middle = Math.floor((failing + passing) / 2);

    if (options.passes(middle)) {
      passing = middle;
    } else {
      failing = middle;
    }
  }

  return passing;
}

function simulatedUnitsNeeded(
  options: PowerQuestion & { readonly effect: number; readonly start: number },
): number {
  const target = options.settings.power;
  const simulationError = Math.sqrt((target * (1 - target)) / simulatedExperimentCount);
  const passes = (unitCount: number) =>
    simulatedPower({ ...options, unitCount }) >= target + safetyMargin * simulationError;
  let failing = smallestUnitCount - 1;
  let passing = Math.max(smallestUnitCount, options.start);

  while (!passes(passing)) {
    if (passing > largestSimulatedUnitCount) {
      return Math.ceil(passing);
    }

    failing = passing;
    passing = Math.ceil(passing * 1.5);
  }

  return smallestPassingCount({ failing, passing, passes });
}

export function planPower(options: PowerQuestion): PowerPlan {
  const { sample, settings } = options;
  const unitCount = unitCountOf(sample);
  const targetEffect = settings.targetEffect ?? observedEffectOf(sample);
  const approximate = powerAnswer({
    unitVariance: unitVarianceOf(sample),
    unitCount,
    targetEffect,
    settings,
  });
  const canSimulate =
    unitCount >= smallestUnitCount &&
    targetEffect !== 0 &&
    approximate.unitsNeeded <= largestSimulatedUnitCount;

  if (!canSimulate) {
    return { method: "normal-approximation", ...approximate };
  }

  const unitsNeeded = simulatedUnitsNeeded({
    ...options,
    effect: targetEffect,
    start: approximate.unitsNeeded,
  });

  return {
    method: "simulation",
    targetEffect: Math.abs(targetEffect),
    unitsNeeded,
    additionalUnits: Math.max(0, unitsNeeded - unitCount),
    minimumDetectableEffect:
      approximate.minimumDetectableEffect * Math.sqrt(unitsNeeded / approximate.unitsNeeded),
  };
}
