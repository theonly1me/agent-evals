import { expect, test } from "bun:test";
import type { RunRecord } from "@agent-evals/records";
import { createPythonRandom } from "@agent-evals/statistics";
import { defaultComparisonSettings } from "@agent-evals/verdict";
import { simulateExperiment } from "@agent-evals/verdict/testing";
import { buildReport, renderReport, type Report, type ReportQuestion } from "./index";

const arms = { baseline: "baseline", candidate: "candidate" };
const settings = { ...defaultComparisonSettings, resample: { seed: 5, rounds: 2000 } };

function experiment(options: { taskCount: number; trueEffect: number }): RunRecord[] {
  return simulateExperiment({
    generator: createPythonRandom(31),
    design: { ...options, repeatCount: 3 },
  });
}

function reportOf(question: Partial<ReportQuestion> & { records: readonly RunRecord[] }): Report {
  const report = buildReport({ arms, metric: "passed", settings, ...question });

  if (report === "no-shared-task") {
    throw new Error("The arms share no task.");
  }

  return report;
}

function textOf(report: Report): string {
  return renderReport({ report, format: "text" });
}

test("a large true difference gives the verdict better, with the interval and the unit count", () => {
  const text = textOf(reportOf({ records: experiment({ taskCount: 40, trueEffect: 0.3 }) }));
  const [headline, evidence] = text.split("\n");

  expect(headline).toBe("candidate is better than baseline on passed.");
  expect(evidence).toMatch(
    /^Difference: \+0\.\d+ \(95% interval 0\.\d+ to 0\.\d+, p < 0\.001\) over 40 tasks\./,
  );
});

test("the same records with lower is better give the verdict worse", () => {
  const records = experiment({ taskCount: 40, trueEffect: 0.3 });
  const text = textOf(reportOf({ records, settings: { ...settings, higherIsBetter: false } }));

  expect(text).toStartWith("candidate is worse than baseline on passed.");
  expect(text).toContain("A lower passed is better.");
});

test("a small experiment is not conclusive and states the tasks still needed", () => {
  const report = reportOf({
    records: experiment({ taskCount: 8, trueEffect: 0.1 }),
    settings: { ...settings, targetEffect: 0.1 },
  });
  const text = textOf(report);

  const unitsNeeded = report.power?.unitsNeeded ?? 0;

  expect(unitsNeeded).toBeGreaterThan(8);
  expect(text).toStartWith(
    "Not conclusive: the results cannot tell candidate from baseline on passed.",
  );
  expect(text).toContain(
    `To detect a difference of 0.1 with 80% power, you need about ${unitsNeeded} tasks (${unitsNeeded - 8} more).`,
  );
}, 30_000);

test("one task makes the run the unit, and the report says that the result does not generalize", () => {
  const records = experiment({ taskCount: 1, trueEffect: 0.3 });
  const report = reportOf({ records });

  expect(report.primary.sample.unit).toBe("run");
  expect(textOf(report)).toContain("This comparison has one task, so the unit is the run.");
});

test("results with no spread get no power number", () => {
  const records = ["a", "b"].flatMap((task) =>
    ["baseline", "candidate"].map((arm) => ({
      task,
      arm,
      repeat: 0,
      status: "completed" as const,
      scores: { passed: 1 },
    })),
  );

  expect(textOf(reportOf({ records }))).toContain(
    "The 2 tasks show no spread, so there is no power answer. Add more tasks.",
  );
});

test("the audit, the arms, and a second metric with its adjusted p-value are in every format", () => {
  const records = experiment({ taskCount: 12, trueEffect: 0.2 }).map((record) => ({
    ...record,
    scores: { ...record.scores, turns: record.repeat + 1 },
    durationSeconds: 10,
  }));
  const report = reportOf({ records });
  const markdown = renderReport({ report, format: "markdown" });
  const json: unknown = JSON.parse(renderReport({ report, format: "json" }));

  expect(report.secondary.map((comparison) => comparison.metric)).toEqual(["turns"]);
  expect(markdown).toContain("### Validity audit");
  expect(markdown).toContain("| baseline | 36 | 36 | 0 | 0 | 10 |  |");
  expect(markdown).toContain("| turns | 0 | 0 to 0 | p = 1 |");
  expect(json).toMatchObject({ primary: { metric: "passed", unitCount: 12 } });
});

test("the HTML report escapes names from the results", () => {
  const records = experiment({ taskCount: 6, trueEffect: 0.2 }).map((record) => ({
    ...record,
    arm: record.arm === "candidate" ? "<script>alert(1)</script>" : record.arm,
  }));
  const report = reportOf({
    records,
    arms: { baseline: "baseline", candidate: "<script>alert(1)</script>" },
  });
  const html = renderReport({ report, format: "html" });

  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
});
