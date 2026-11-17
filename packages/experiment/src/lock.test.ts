import { expect, test } from "bun:test";
import path from "node:path";
import { checkLock, freezeExperiment, storeDirectoryName } from "./lock";
import { type Experiment, loadExperiment } from "./spec";
import { writeSampleExperiment } from "./testing/sample";

async function loaded(directory: string): Promise<Experiment> {
  const result = await loadExperiment(directory);

  if (result.status === "rejected") {
    throw new Error(result.problem);
  }

  return result.experiment;
}

test("an experiment that is not frozen cannot run", async () => {
  const directory = await writeSampleExperiment();

  expect(await checkLock(await loaded(directory))).toEqual({
    status: "rejected",
    problem: `The experiment is not frozen. Run agent-evals freeze ${directory} first.`,
  });
});

test("a frozen experiment matches until an input file changes, and the check names the file", async () => {
  const directory = await writeSampleExperiment();
  const lock = await freezeExperiment(await loaded(directory));

  expect(await checkLock(await loaded(directory))).toEqual({ status: "matches", lock });

  await Bun.write(path.join(directory, "arms/hinted/HINT.md"), "The answer is wrong.\n");
  const check = await checkLock(await loaded(directory));

  expect(check.status).toBe("rejected");
  expect(check.status === "rejected" ? check.problem : "").toStartWith(
    "The experiment changed after the freeze. These files changed: arms/hinted/HINT.md.",
  );
});

test("a change of the metric after the freeze is rejected", async () => {
  const directory = await writeSampleExperiment();

  await freezeExperiment(await loaded(directory));
  const specFile = path.join(directory, "experiment.json");
  const spec = await Bun.file(specFile).json();

  await Bun.write(specFile, JSON.stringify({ ...spec, metric: "quality" }, null, 2));
  const check = await checkLock(await loaded(directory));

  expect(check.status === "rejected" ? check.problem : "").toStartWith(
    "The experiment changed after the freeze. The design in the experiment file changed.",
  );
});

test("a change of the run limit is not a change of the design", async () => {
  const directory = await writeSampleExperiment();
  const lock = await freezeExperiment(await loaded(directory));
  const specFile = path.join(directory, "experiment.json");
  const spec = await Bun.file(specFile).json();

  await Bun.write(specFile, JSON.stringify({ ...spec, maxRuns: 3, maxCostUsd: 2 }, null, 2));

  expect(await checkLock(await loaded(directory))).toEqual({ status: "matches", lock });
});

test("a new file is a change, and the results folder is not", async () => {
  const directory = await writeSampleExperiment();
  const lock = await freezeExperiment(await loaded(directory));

  await Bun.write(path.join(directory, storeDirectoryName, "runs.jsonl"), "{}\n");
  expect(await checkLock(await loaded(directory))).toEqual({ status: "matches", lock });

  await Bun.write(path.join(directory, "arms/plain/EXTRA.md"), "new\n");
  const check = await checkLock(await loaded(directory));

  expect(check.status === "rejected" ? check.problem : "").toContain("arms/plain/EXTRA.md");
});
