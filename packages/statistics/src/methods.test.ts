import { expect, test } from "bun:test";
import { holmAdjusted } from "./holm";
import { normalQuantile } from "./normal";
import { pairedDifferenceInterval, pairedPValue } from "./paired";
import { powerAnswer, sampleVariance } from "./power";
import { compensatedSum, exactSum } from "./sums";
import { permutationPValue } from "./unpaired";

test("five equal differences give the exact two-sided p-value 2 of 32", () => {
  expect(pairedPValue({ differences: [1, 1, 1, 1, 1] })).toBe(2 / 32);
});

test("differences that cancel give the p-value 1", () => {
  expect(pairedPValue({ differences: [1, -1, 2, -2] })).toBe(1);
});

test("the paired interval of constant differences has no width", () => {
  expect(pairedDifferenceInterval({ differences: [0.5, 0.5, 0.5] })).toEqual({
    estimate: 0.5,
    lower: 0.5,
    upper: 0.5,
  });
});

test("separated groups give the smallest permutation p-value", () => {
  const pValue = permutationPValue({
    baseline: [0, 0, 0, 0, 0, 0, 0, 0],
    candidate: [1, 1, 1, 1, 1, 1, 1, 1],
    resample: { seed: 1, rounds: 999 },
  });
  expect(pValue).toBeLessThan(0.01);
});

test("Holm adjustment matches the textbook example", () => {
  const adjusted = holmAdjusted([0.01, 0.04, 0.03, 0.005]);
  expect(adjusted.map((value) => Number(value.toFixed(10)))).toEqual([0.03, 0.06, 0.06, 0.02]);
});

test("normal quantiles match the standard table", () => {
  expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
  expect(normalQuantile(0.8)).toBeCloseTo(0.841621, 5);
  expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 5);
});

test("power needs 32 units for half a standard deviation", () => {
  const answer = powerAnswer({
    unitVariance: 1,
    unitCount: 10,
    targetEffect: 0.5,
    settings: { alpha: 0.05, power: 0.8 },
  });
  expect(answer.unitsNeeded).toBe(32);
  expect(answer.additionalUnits).toBe(22);
  expect(answer.minimumDetectableEffect).toBeCloseTo(0.886, 3);
});

test("an effect of zero needs an infinite number of units", () => {
  const answer = powerAnswer({
    unitVariance: 1,
    unitCount: 10,
    targetEffect: 0,
    settings: { alpha: 0.05, power: 0.8 },
  });
  expect(answer.unitsNeeded).toBe(Number.POSITIVE_INFINITY);
});

test("sample variance uses the n minus 1 divisor", () => {
  expect(sampleVariance([1, 2, 3, 4])).toBeCloseTo(5 / 3, 12);
});

test("the sums keep digits that a plain loop loses", () => {
  expect(exactSum([1e100, 1, -1e100])).toBe(1);
  expect(compensatedSum([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])).toBe(5.5);
});
