import { expect, test } from "bun:test";
import { isScored, runRecordSchema, type RunRecord } from "./index";

const record: RunRecord = {
  task: "add",
  arm: "baseline",
  repeat: 0,
  status: "completed",
  scores: { reward: 1 },
};

test("a record with an unknown status or an empty task is not a run record", () => {
  expect(runRecordSchema.safeParse(record).success).toBeTrue();
  expect(runRecordSchema.safeParse({ ...record, status: "passed" }).success).toBeFalse();
  expect(runRecordSchema.safeParse({ ...record, task: "" }).success).toBeFalse();
  expect(runRecordSchema.safeParse({ ...record, scores: { reward: "1" } }).success).toBeFalse();
});

test("a failed run is never scored, and a timeout is scored only for a metric that it has", () => {
  const failed: RunRecord = { ...record, status: "infra-failure" };
  const timedOut: RunRecord = { ...record, status: "timeout" };

  expect(isScored({ record, metric: "reward" })).toBeTrue();
  expect(isScored({ record: failed, metric: "reward" })).toBeFalse();
  expect(isScored({ record: timedOut, metric: "reward" })).toBeTrue();
  expect(isScored({ record: timedOut, metric: "turns" })).toBeFalse();
});
