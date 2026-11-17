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

test("the isolation check names the level, and fails when a run has no record of it", () => {
  const container = [
    run({ isolation: "container" }),
    run({ arm: "after", isolation: "container" }),
  ];
  const host = [run({ isolation: "home" }), run({ arm: "after", isolation: "home" })];
  const partial = [run({ isolation: "home" }), run({ arm: "after" })];
  const isolationOf = (records: readonly RunRecord[]) =>
    auditRecords({ records, arms }).find((check) => check.id === "isolation");

  expect(isolationOf(container)).toMatchObject({
    status: "passed",
    detail: "Each of the 2 runs was in a container with a new home folder.",
  });
  expect(isolationOf(host)).toMatchObject({
    status: "passed",
    detail:
      "Each of the 2 runs had a new home folder and a clean environment. 2 ran on the host, which does not block a read by an absolute path.",
  });
  expect(isolationOf(partial)).toMatchObject({
    status: "failed",
    detail: "1 of 2 runs carry no isolation record.",
  });
});

test("the judge order check fails when a judged run had one order only", () => {
  const both = [run({ judgeOrders: 2 }), run({ arm: "after", judgeOrders: 2 })];
  const single = [run({ judgeOrders: 2 }), run({ arm: "after", judgeOrders: 1 })];
  const orderOf = (records: readonly RunRecord[]) =>
    auditRecords({ records, arms }).find((check) => check.id === "judge-order");

  expect(orderOf(both)).toMatchObject({
    status: "passed",
    detail: "The pairwise judge saw the pair of each of the 2 judged runs in both orders.",
  });
  expect(orderOf(single)).toMatchObject({
    status: "failed",
    detail:
      "1 of 2 judged runs had one order only, so the position of an entry can change the score.",
  });
  expect(orderOf([run({}), run({ arm: "after" })])).toMatchObject({ status: "not-checked" });
});

test("the design check passes for one digest, and fails for a mixed or a missing digest", () => {
  const frozen = [run({ design: "aaaa" }), run({ arm: "after", design: "aaaa" })];
  const changed = [run({ design: "aaaa" }), run({ arm: "after", design: "bbbb" })];
  const partial = [run({ design: "aaaa" }), run({ arm: "after" })];
  const designOf = (records: readonly RunRecord[]) =>
    auditRecords({ records, arms }).find((check) => check.id === "frozen-design");

  expect(designOf(frozen)).toMatchObject({
    status: "passed",
    detail: "Each of the 2 runs carries the frozen design aaaa.",
  });
  expect(designOf(changed)).toMatchObject({
    status: "failed",
    detail: "The runs carry 2 different designs, so the design changed between runs.",
  });
  expect(designOf(partial)).toMatchObject({
    status: "failed",
    detail: "1 of 2 runs carry no design digest.",
  });
});
