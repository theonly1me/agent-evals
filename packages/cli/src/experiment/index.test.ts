import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "../main";

async function newFolder(): Promise<string> {
  return path.join(await mkdtemp(path.join(os.tmpdir(), "agent-evals-cli-run-")), "example");
}

test("init, freeze, and run give a verdict for the example with no model", async () => {
  const folder = await newFolder();
  const progress: string[] = [];
  const initialized = await runCommand(["init", folder]);
  const frozen = await runCommand(["freeze", folder]);
  const outcome = await runCommand(["run", folder], (line) => progress.push(line));

  expect(initialized.exitCode).toBe(0);
  expect(frozen.stdout).toMatch(/^Froze example: design [0-9a-f]{12}, 4 input files\./);
  expect(outcome.stderr).toBe("");
  expect(outcome.stdout).toStartWith(
    "All 16 tasks are complete.\n\nwith-hint is better than without-hint on passed.\nDifference: +0.5 (95% interval 0.281 to 0.719, p = 0.002) over 16 tasks.",
  );
  expect(outcome.stdout).toContain("Each of the 64 runs carries the frozen design");
  expect(progress).toHaveLength(64);
  expect(progress[0]).toMatch(/^\[1 of 64\] \w+ with(out)?-hint repeat 0: completed passed=[01]$/);
}, 60_000);

test("run refuses an experiment that is not frozen, and one that changed after the freeze", async () => {
  const folder = await newFolder();

  await runCommand(["init", folder]);
  const notFrozen = await runCommand(["run", folder]);

  await runCommand(["freeze", folder]);
  await Bun.write(path.join(folder, "arms/with-hint/HINT.md"), "A stronger hint.\n");
  const changed = await runCommand(["run", folder]);

  expect(notFrozen.exitCode).toBe(1);
  expect(notFrozen.stderr).toBe(
    `The experiment is not frozen. Run agent-evals freeze ${folder} first.\n`,
  );
  expect(changed.exitCode).toBe(1);
  expect(changed.stderr).toStartWith(
    "The experiment changed after the freeze. These files changed: arms/with-hint/HINT.md.",
  );
});

test("init does not write into a folder that has files", async () => {
  const folder = await newFolder();

  await Bun.write(path.join(folder, "notes.md"), "mine\n");
  const outcome = await runCommand(["init", folder]);

  expect(outcome.exitCode).toBe(1);
  expect(outcome.stderr).toBe(`${folder} is not empty. Name a new folder.\n`);
  expect(await Bun.file(path.join(folder, "experiment.yaml")).exists()).toBe(false);
});

test("run writes a Markdown report to a file", async () => {
  const folder = await newFolder();
  const output = path.join(folder, "..", "report.md");

  await runCommand(["init", folder]);
  await runCommand(["freeze", folder]);
  const outcome = await runCommand(["run", folder, "--format", "markdown", "--output", output]);

  expect(outcome.stdout).toBe(`All 16 tasks are complete.\n\nWrote ${output}\n`);
  expect(await Bun.file(output).text()).toStartWith("## with-hint against without-hint on passed");
}, 60_000);
