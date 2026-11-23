import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { freezeExperiment } from "./lock";
import { runExperiment } from "./runner";
import { hostSandbox } from "./sandbox";
import { loadExperiment } from "./spec";
import { readAttempts, storeOf } from "./store";
import { writeSampleExperiment } from "./testing/sample";

async function limitedOnceSample() {
  const marker = path.join(os.tmpdir(), `agent-evals-limit-${crypto.randomUUID()}`);
  const loaded = await loadExperiment(
    await writeSampleExperiment({
      tasks: ["limited", "b"],
      spec: {
        repeats: 1,
        retries: 0,
        maxRuns: 4,
        arms: { plain: {}, hinted: { env: { LIMIT_ONCE_MARKER: marker } } },
      },
    }),
  );

  if (loaded.status === "rejected") {
    throw new Error(loaded.problem);
  }

  return { experiment: loaded.experiment, lock: await freezeExperiment(loaded.experiment) };
}

test("a usage limit stops the run and keeps the attempt, and the next run tries the cell again without a retry", async () => {
  const { experiment, lock } = await limitedOnceSample();
  const first = await runExperiment({ experiment, lock, sandbox: hostSandbox });

  expect(first.reason).toBe("usage-limit");

  const second = await runExperiment({ experiment, lock, sandbox: hostSandbox });
  const attempts = await readAttempts(storeOf(experiment));
  const limitedCell = attempts.filter(
    (attempt) => attempt.task === "limited" && attempt.arm === "hinted",
  );

  expect(second.reason).toBe("complete");
  expect(limitedCell.map((attempt) => [attempt.attempt, attempt.status, attempt.limited])).toEqual([
    [0, "infra-failure", true],
    [1, "completed", undefined],
  ]);
  expect(second.records).toHaveLength(4);
  expect(second.records.every((record) => record.status === "completed")).toBe(true);
});

test("with a wait on the limit, the run waits one time and then finishes every cell", async () => {
  const { experiment, lock } = await limitedOnceSample();
  const waits: number[] = [];
  const summary = await runExperiment({
    experiment,
    lock,
    sandbox: hostSandbox,
    limitWait: {
      seconds: 900,
      sleep: async (seconds) => {
        waits.push(seconds);
      },
    },
  });

  expect(summary.reason).toBe("complete");
  expect(waits).toEqual([900]);
  expect(summary.records.every((record) => record.status === "completed")).toBe(true);
});
