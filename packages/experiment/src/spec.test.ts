import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadExperiment } from "./spec";

async function directoryWith(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-evals-spec-"));

  for (const [file, text] of Object.entries(files)) {
    await Bun.write(path.join(directory, file), text);
  }

  return directory;
}

const validYaml = `
name: sample
metric: passed
baseline: plain
arms:
  plain: {}
  hinted:
    files:
      HINT.md: arms/hinted/HINT.md
tasks:
  - id: a
    prompt: Solve a.
  - id: b
    promptFile: tasks/b.md
subject:
  command: [node, subject.mjs]
grader:
  command: [node, grader.mjs]
`;

test("a YAML experiment loads with the documented defaults", async () => {
  const directory = await directoryWith({ "experiment.yaml": validYaml });
  const loaded = await loadExperiment(directory);

  expect(loaded.status).toBe("loaded");

  if (loaded.status === "loaded") {
    expect(loaded.experiment.directory).toBe(path.resolve(directory));
    expect(loaded.experiment.repeats).toBe(1);
    expect(loaded.experiment.retries).toBe(1);
    expect(loaded.experiment.seed).toBe(20261007);
    expect(loaded.experiment.arms.hinted?.files).toEqual({ "HINT.md": "arms/hinted/HINT.md" });
    expect(loaded.experiment.arms.plain?.flags).toEqual([]);
  }
});

test("a baseline that is not an arm is rejected with the list of arms", async () => {
  const directory = await directoryWith({
    "experiment.yaml": validYaml.replace("baseline: plain", "baseline: control"),
  });
  const loaded = await loadExperiment(directory);

  expect(loaded).toEqual({
    status: "rejected",
    problem: `${path.join(directory, "experiment.yaml")} is not valid:\nbaseline: "control" is not an arm. The arms are: plain, hinted`,
  });
});

test("an unknown key is rejected, so a misspelled setting cannot change the design in silence", async () => {
  const directory = await directoryWith({
    "experiment.yaml": `${validYaml}repeat: 5\n`,
  });
  const loaded = await loadExperiment(directory);

  expect(loaded.status).toBe("rejected");
  expect(loaded.status === "rejected" ? loaded.problem : "").toContain('"repeat"');
});

test("a task with two prompts, a repeated task id, and a look after the last task are rejected", async () => {
  const twoPrompts = await directoryWith({
    "experiment.yaml": validYaml.replace(
      "    prompt: Solve a.",
      "    prompt: Solve a.\n    promptFile: a.md",
    ),
  });
  const repeated = await directoryWith({
    "experiment.yaml": validYaml.replace("  - id: b", "  - id: a"),
  });
  const lateLook = await directoryWith({ "experiment.yaml": `${validYaml}looks: [1, 3]\n` });
  const problemOf = async (directory: string) => {
    const loaded = await loadExperiment(directory);

    return loaded.status === "rejected" ? loaded.problem.split("\n").slice(1) : [];
  };

  expect(await problemOf(twoPrompts)).toEqual(['tasks: "a" needs one of prompt and promptFile']);
  expect(await problemOf(repeated)).toEqual(['tasks: the id "a" appears more than once']);
  expect(await problemOf(lateLook)).toEqual([
    "looks: the look at 3 tasks is after the last of 2 tasks",
  ]);
});

test("a folder with no experiment file is rejected with the names to use", async () => {
  const directory = await directoryWith({ "notes.md": "none" });

  expect(await loadExperiment(directory)).toEqual({
    status: "rejected",
    problem: `${directory} has no experiment file. The names are: experiment.yaml, experiment.yml, experiment.json.`,
  });
});
