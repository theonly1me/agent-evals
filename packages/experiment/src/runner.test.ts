import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { freezeExperiment, type Lock } from "./lock";
import { runExperiment } from "./runner";
import { hostSandbox } from "./sandbox";
import { type Experiment, loadExperiment } from "./spec";
import { readAttempts, storeOf } from "./store";
import { type SampleOptions, writeSampleExperiment } from "./testing/sample";

async function frozenSample(
  options: SampleOptions = {},
): Promise<{ readonly experiment: Experiment; readonly lock: Lock }> {
  const result = await loadExperiment(await writeSampleExperiment(options));

  if (result.status === "rejected") {
    throw new Error(result.problem);
  }

  return { experiment: result.experiment, lock: await freezeExperiment(result.experiment) };
}

function meanOf(options: {
  readonly records: readonly { arm: string; scores: Record<string, number> }[];
  readonly arm: string;
}): number {
  const scores = options.records
    .filter((record) => record.arm === options.arm)
    .map((record) => record.scores.passed ?? Number.NaN);

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

test("a run gives each arm its overlay, and each record carries the score and the design digest", async () => {
  const { experiment, lock } = await frozenSample();
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(summary.reason).toBe("complete");
  expect(summary.newAttempts).toBe(4 * 2 * 2);
  expect(summary.records).toHaveLength(16);
  expect(meanOf({ records: summary.records, arm: "hinted" })).toBe(1);
  expect(meanOf({ records: summary.records, arm: "plain" })).toBe(0);
  expect(summary.records.every((record) => record.design === lock.digest)).toBe(true);
  expect(summary.records.every((record) => record.status === "completed")).toBe(true);
  expect(summary.records[0]?.costUsd).toBe(0.25);
  expect(summary.records[0]?.versions).toEqual({ subject: "1.0.0" });
});

test("a second run of a complete experiment starts no run", async () => {
  const { experiment, lock } = await frozenSample();

  await runExperiment({ experiment, lock, sandbox: hostSandbox });
  const again = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(again.newAttempts).toBe(0);
  expect(again.records).toHaveLength(16);
});

test("the subject gets a new home and only the named variables of the environment", async () => {
  process.env.AGENT_EVALS_TEST_SECRET = "do-not-pass";
  process.env.AGENT_EVALS_TEST_ALLOWED = "pass";
  const { experiment, lock } = await frozenSample({
    tasks: ["a"],
    spec: { repeats: 1, passEnv: ["AGENT_EVALS_TEST_ALLOWED"] },
  });
  const seen: { home: string; environment: string[] }[] = [];
  const graderRequests = path.join(experiment.directory, "grader-requests");

  await runExperiment({ experiment, lock, sandbox: hostSandbox });

  for (const file of await readdir(graderRequests)) {
    const request = await Bun.file(path.join(graderRequests, file)).json();

    seen.push(JSON.parse(request.output));
  }

  expect(seen).toHaveLength(2);
  expect(seen.every((view) => view.home.startsWith(storeOf(experiment).directory))).toBe(true);
  expect(seen.every((view) => view.environment.includes("AGENT_EVALS_TEST_ALLOWED"))).toBe(true);
  expect(seen.some((view) => view.environment.includes("AGENT_EVALS_TEST_SECRET"))).toBe(false);
});

test("the grader cannot tell the arm from its request", async () => {
  const { experiment, lock } = await frozenSample({ tasks: ["a"] });
  const graderRequests = path.join(experiment.directory, "grader-requests");

  await runExperiment({ experiment, lock, sandbox: hostSandbox });
  const texts = await Promise.all(
    (await readdir(graderRequests)).map((file) => Bun.file(path.join(graderRequests, file)).text()),
  );

  expect(texts).toHaveLength(4);
  expect(texts.some((text) => text.includes("hinted") || text.includes("plain"))).toBe(false);
});

test("a failed subject is retried one time, and both attempts are in the store", async () => {
  const marker = path.join(os.tmpdir(), `agent-evals-marker-${crypto.randomUUID()}`);
  const { experiment, lock } = await frozenSample({
    tasks: ["flaky"],
    spec: {
      repeats: 1,
      arms: { plain: {}, hinted: { env: { FAIL_ONCE_MARKER: marker } } },
    },
  });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });
  const attempts = await readAttempts(storeOf(experiment));
  const hinted = attempts.filter((attempt) => attempt.arm === "hinted");

  expect(hinted.map((attempt) => [attempt.attempt, attempt.status])).toEqual([
    [0, "infra-failure"],
    [1, "completed"],
  ]);
  expect(hinted[0]?.detail).toStartWith("the subject exited with code 3");
  expect(hinted[0]?.scores).toEqual({});
  expect(summary.records).toHaveLength(2);
  expect(summary.records.every((record) => record.status === "completed")).toBe(true);
});

test("a subject that fails each time stays a failure with no score", async () => {
  const { experiment, lock } = await frozenSample({
    tasks: ["a"],
    spec: { repeats: 1, subject: { command: [process.execPath, "-e", "process.exit(2)"] } },
  });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(summary.newAttempts).toBe(4);
  expect(summary.records.map((record) => [record.status, record.scores])).toEqual([
    ["infra-failure", {}],
    ["infra-failure", {}],
  ]);
});

test("a subject over the time limit is a timeout, and the grader still scores its workspace", async () => {
  const { experiment, lock } = await frozenSample({
    tasks: ["slow"],
    spec: { repeats: 1, timeoutSeconds: 1 },
  });
  const summary = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(summary.records.map((record) => [record.status, record.scores])).toEqual([
    ["timeout", { passed: 0 }],
    ["timeout", { passed: 0 }],
  ]);
});

test("the run limit stops the experiment, and the next run continues from the store", async () => {
  const limited = await frozenSample({ spec: { maxRuns: 5 } });
  const stopped = await runExperiment({ ...limited, sandbox: hostSandbox });

  expect(stopped.reason).toBe("run-limit");
  expect(stopped.newAttempts).toBe(5);
  expect(await readAttempts(storeOf(limited.experiment))).toHaveLength(5);
});

test("a registered look can stop the experiment, and it sees only complete tasks", async () => {
  const { experiment, lock } = await frozenSample({ spec: { looks: [2] } });
  const looks: { tasksDone: number; recordCount: number }[] = [];
  const summary = await runExperiment({
    experiment,
    lock,
    sandbox: hostSandbox,
    atLook: (look) => {
      looks.push({ tasksDone: look.tasksDone, recordCount: look.records.length });

      return "stop";
    },
  });

  expect(looks).toEqual([{ tasksDone: 2, recordCount: 8 }]);
  expect(summary.reason).toBe("look");
  expect(summary.tasksDone).toBe(2);
  expect(summary.records).toHaveLength(8);
});
