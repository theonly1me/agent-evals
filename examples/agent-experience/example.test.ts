import { expect, test } from "bun:test";
import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  freezeExperiment,
  hostSandbox,
  loadExperiment,
  runExperiment,
} from "@agent-evals/experiment";

const scriptedSubject = `
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const request = JSON.parse(readFileSync(0, "utf8"));
const knowsOptions = readFileSync("README.md", "utf8").includes("--where");
const flags = knowsOptions ? JSON.parse(readFileSync(process.argv[2], "utf8"))[request.task.id] : [];
const result = spawnSync(process.execPath, ["tally.mjs", "orders.csv", ...flags], { encoding: "utf8" });
writeFileSync("answer.txt", result.stdout);
process.stdout.write(JSON.stringify({ output: "done" }));
`;

async function copyOfExample(): Promise<string> {
  const copy = await mkdtemp(path.join(os.tmpdir(), "agent-evals-agent-experience-"));

  await cp(import.meta.dir, copy, { recursive: true });

  return copy;
}

test("the example loads with Claude Code as the subject and two arms that differ in one file", async () => {
  const loaded = await loadExperiment(import.meta.dir);

  expect(loaded.status).toBe("loaded");

  if (loaded.status === "loaded") {
    expect(loaded.experiment.subject).toMatchObject({ agent: "claude-code" });
    expect(loaded.experiment.tasks).toHaveLength(8);
    expect(Object.values(loaded.experiment.arms).map((arm) => Object.keys(arm.files))).toEqual([
      ["README.md"],
      ["README.md"],
    ]);
  }
});

test("with a scripted subject, the full README passes each task and the short one passes only the default task", async () => {
  const copy = await copyOfExample();
  const specFile = path.join(copy, "experiment.yaml");
  const spec = Bun.YAML.parse(await Bun.file(specFile).text());

  await Bun.write(path.join(copy, "scripted-subject.mjs"), scriptedSubject);
  await Bun.write(
    specFile,
    JSON.stringify({
      ...Object(spec),
      repeats: 1,
      looks: [],
      passEnv: [],
      subject: {
        command: [process.execPath, "./scripted-subject.mjs", "./shared/expected.json"],
      },
    }),
  );
  const loaded = await loadExperiment(specFile);

  if (loaded.status === "rejected") {
    throw new Error(loaded.problem);
  }

  const summary = await runExperiment({
    experiment: loaded.experiment,
    lock: await freezeExperiment(loaded.experiment),
    sandbox: hostSandbox,
  });
  const passedTasks = (arm: string) =>
    summary.records
      .filter((record) => record.arm === arm && record.scores.correct === 1)
      .map((record) => record.task)
      .sort();

  expect(summary.records.map((record) => record.status)).toEqual(Array(16).fill("completed"));
  expect(passedTasks("full-readme")).toHaveLength(8);
  expect(passedTasks("short-readme")).toEqual(["total-amount"]);
}, 60_000);
