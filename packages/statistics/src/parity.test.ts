import { expect, test } from "bun:test";
import fixture from "./fixtures/no-comments.json" with { type: "json" };
import { differenceInterval, type Interval, meanInterval, signFlipPValue } from "./intervals";
import { createPythonRandom } from "./mersenneTwister";

function asTriple(interval: Interval): number[] {
  return [interval.estimate, interval.lower, interval.upper];
}

test("the generator matches Python random.Random for 10,000 outputs", () => {
  const generator = createPythonRandom(fixture.seed);
  const outputs = fixture.randoms.map(() => generator.random());
  expect(outputs).toEqual(fixture.randoms);
});

test("the generator matches Python for a seed above 32 bits", () => {
  const generator = createPythonRandom(fixture.bigSeed);
  const outputs = fixture.bigRandoms.map(() => generator.random());
  expect(outputs).toEqual(fixture.bigRandoms);
});

test("mean and difference intervals equal the saved no-comments analysis", () => {
  for (const metricCase of fixture.metricCases) {
    const computed = {
      A: asTriple(meanInterval({ values: metricCase.baseline })),
      B: asTriple(meanInterval({ values: metricCase.candidate })),
      B_minus_A: asTriple(
        differenceInterval({
          baseline: metricCase.baseline,
          candidate: metricCase.candidate,
        }),
      ),
    };
    expect({ name: metricCase.name, ...computed }).toEqual({
      name: metricCase.name,
      ...metricCase.expected,
    });
  }
});

test("judge win rates and sign-flip p-values equal the saved analysis", () => {
  for (const judgeCase of fixture.judgeCases) {
    const computed = {
      winRate: asTriple(meanInterval({ values: judgeCase.scores })),
      pValue: signFlipPValue({ values: judgeCase.scores, center: 0.5 }),
    };
    expect({ name: judgeCase.name, ...computed }).toEqual({
      name: judgeCase.name,
      winRate: judgeCase.winRate,
      pValue: judgeCase.pValue,
    });
  }
});
