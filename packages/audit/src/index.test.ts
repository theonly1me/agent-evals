import { expect, test } from "bun:test";
import type { RunRecord } from "@agent-evals/records";
import { auditRecords } from "./index";

const arms = { baseline: "before", candidate: "after" };

function run(overrides: Partial<RunRecord>): RunRecord {
  return {
    task: "a",
    arm: "before",
    repeat: 0,
    status: "completed",
    scores: { reward: 1 },
    ...overrides,
  };
}

function statusesOf(records: readonly RunRecord[]) {
  return Object.fromEntries(
    auditRecords({ records, arms }).map((check) => [check.id, check.status]),
  );
}

test("equal tasks, equal run counts, and no failure pass, and runner checks stay not checked", () => {
  const records = [run({}), run({ arm: "after" })];

  expect(statusesOf(records)).toEqual({
    "balanced-arms": "passed",
    "failed-runs": "passed",
    "stable-versions": "not-checked",
    "frozen-design": "not-checked",
    isolation: "not-checked",
    "judge-order": "not-checked",
  });
});

test("a task in one arm only, or a different run count, fails the balance check", () => {
  const onlyBefore = [run({}), run({ arm: "after" }), run({ task: "b" })];
  const uneven = [run({}), run({ repeat: 1 }), run({ arm: "after" })];

  expect(statusesOf(onlyBefore)["balanced-arms"]).toBe("failed");
  expect(statusesOf(uneven)["balanced-arms"]).toBe("failed");
});

test("a failure rate gap above 10 points fails, and the detail gives both counts", () => {
  const records = [
    ...Array.from({ length: 5 }, (_unused, repeat) => run({ repeat })),
    ...Array.from({ length: 5 }, (_unused, repeat) =>
      run({ arm: "after", repeat, status: repeat === 0 ? "infra-failure" : "completed" }),
    ),
  ];
  const check = auditRecords({ records, arms }).find((candidate) => candidate.id === "failed-runs");

  expect(check?.status).toBe("failed");
  expect(check?.detail).toContain("before: 0 of 5 runs failed. after: 1 of 5 runs failed.");
});

test("a version that changes inside one arm fails, and a version that differs between arms is listed", () => {
  const drifting = [
    run({ versions: { agent: "1.0" } }),
    run({ repeat: 1, versions: { agent: "1.1" } }),
    run({ arm: "after", versions: { agent: "1.0" } }),
  ];
  const differing = [
    run({ versions: { model: "small" } }),
    run({ arm: "after", versions: { model: "large" } }),
  ];
  const check = auditRecords({ records: differing, arms }).find(
    (candidate) => candidate.id === "stable-versions",
  );

  expect(statusesOf(drifting)["stable-versions"]).toBe("failed");
  expect(check).toMatchObject({ status: "passed", detail: "The arms differ in: model." });
});
