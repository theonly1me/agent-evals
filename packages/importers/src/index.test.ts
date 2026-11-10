import { expect, test } from "bun:test";
import path from "node:path";
import { importRunRecords, type ImportResult } from "./index";
import { importInspectLog } from "./inspect";
import { importJsonl } from "./jsonl";

const fixtures = path.join(import.meta.dir, "fixtures");

function recordsOf(result: ImportResult) {
  if (result.status === "rejected") {
    throw new Error(result.problem);
  }

  return result.records;
}

function problemOf(result: ImportResult): string {
  return result.status === "rejected" ? result.problem : "imported";
}

test("a Harbor job keeps a valid reward, a timeout with a reward, and no score for a failed trial", async () => {
  const result = await importRunRecords({
    location: path.join(fixtures, "harbor-job"),
    arm: "with-skill",
  });
  const summary = recordsOf(result).map((record) => [
    record.task,
    record.repeat,
    record.status,
    record.scores,
  ]);

  expect(summary).toEqual([
    ["add", 0, "completed", { reward: 1 }],
    ["add", 1, "completed", { reward: 0 }],
    ["multiply", 0, "infra-failure", {}],
    ["subtract", 0, "timeout", { reward: 1 }],
    ["subtract", 1, "infra-failure", {}],
  ]);
  expect(recordsOf(result)[0]).toMatchObject({
    arm: "with-skill",
    costUsd: 0.12,
    durationSeconds: 150,
    versions: { agent: "claude-code@2.1.319", model: "claude-sonnet-5-5" },
  });
});

test("a real Inspect AI log dump gives one record for each sample and epoch", async () => {
  const result = await importRunRecords({ location: path.join(fixtures, "inspect-log.json") });
  const summary = recordsOf(result)
    .map((record) => `${record.arm} ${record.task} ${record.repeat} ${record.scores.includes}`)
    .sort();

  expect(summary).toEqual([
    "inspect-log arithmetic/add 0 1",
    "inspect-log arithmetic/add 1 1",
    "inspect-log arithmetic/multiply 0 1",
    "inspect-log arithmetic/multiply 1 1",
    "inspect-log arithmetic/subtract 0 0",
    "inspect-log arithmetic/subtract 1 0",
  ]);
});

test("an Inspect AI sample with an error has no score", () => {
  const result = importInspectLog({
    file: "log.json",
    arm: "baseline",
    content: {
      eval: { task: "sums", model: "mockllm/model" },
      samples: [{ id: 1, epoch: 1, scores: { match: { value: "C" } }, error: { message: "boom" } }],
    },
  });

  expect(recordsOf(result)).toMatchObject([{ status: "infra-failure", scores: {} }]);
});

test("a real promptfoo output groups the repeats of one test into one task for each provider", async () => {
  const result = await importRunRecords({ location: path.join(fixtures, "promptfoo-output.json") });
  const summary = recordsOf(result)
    .map((record) => `${record.arm} ${record.task} ${record.repeat} ${record.scores.success}`)
    .sort();

  expect(summary).toEqual([
    "baseline test-0-vars-0 0 1",
    "baseline test-0-vars-0 1 1",
    "baseline test-1-vars-0 0 0",
    "baseline test-1-vars-0 1 0",
    "candidate test-0-vars-0 0 1",
    "candidate test-0-vars-0 1 1",
    "candidate test-1-vars-0 0 0",
    "candidate test-1-vars-0 1 0",
  ]);
});

test("a bad line stops the JSONL import and names the line and the field", () => {
  const good = JSON.stringify({ task: "a", arm: "x", repeat: 0, status: "completed", scores: {} });
  const bad = JSON.stringify({ task: "a", arm: "x", repeat: 0, status: "done", scores: {} });
  const problem = problemOf(importJsonl({ file: "runs.jsonl", text: `${good}\n${bad}\n` }));

  expect(problem).toContain("runs.jsonl:2 is not a run record.");
  expect(problem).toContain("status");
});

test("a Harbor trial with a renamed field stops the import and names the field", async () => {
  const directory = path.join(import.meta.dir, "fixtures", "harbor-renamed");
  const problem = problemOf(await importRunRecords({ location: directory }));

  expect(problem).toContain("is not a Harbor trial result.");
  expect(problem).toContain("task_name");
});

test("a missing path, a binary Inspect AI log, and an unknown JSON shape are rejected with the reason", async () => {
  expect(
    problemOf(await importRunRecords({ location: path.join(fixtures, "absent.json") })),
  ).toContain("does not exist");
  expect(
    problemOf(await importRunRecords({ location: path.join(fixtures, "binary.eval") })),
  ).toContain("inspect log dump");
  expect(
    problemOf(await importRunRecords({ location: path.join(fixtures, "unknown.json") })),
  ).toContain("is not a known format");
});
