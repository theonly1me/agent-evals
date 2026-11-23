import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { $ } from "bun";

const datasetRepository = "https://github.com/laude-institute/harbor-datasets.git";
const datasetCommit = "f30b14415dd733c83627204bad0af69a89ceb46f";
const datasetFolder = "datasets/aider_polyglot";
const taskPrefix = "polyglot_python_";
const expectedTaskCount = 34;
const tasksDirectory = path.join(import.meta.dir, "shared", "tasks");
const hiddenWorkspaceEntries = new Set([".oracle"]);
const runnerOnlyTestFiles = new Set(["test.sh", ".meta"]);

async function cloneDataset(): Promise<string> {
  const checkout = await mkdtemp(path.join(os.tmpdir(), "five-evals-dataset-"));

  await $`git clone --quiet --filter=blob:none --no-checkout ${datasetRepository} ${checkout}`;
  await $`git -C ${checkout} sparse-checkout set ${datasetFolder}`.quiet();
  await $`git -C ${checkout} checkout --quiet ${datasetCommit}`;

  return path.join(checkout, datasetFolder);
}

async function copyEntries(options: {
  readonly source: string;
  readonly target: string;
  readonly skipped: ReadonlySet<string>;
}): Promise<void> {
  await mkdir(options.target, { recursive: true });

  for (const entry of await readdir(options.source)) {
    if (!options.skipped.has(entry)) {
      await cp(path.join(options.source, entry), path.join(options.target, entry), {
        recursive: true,
      });
    }
  }
}

async function writeTask(options: { readonly source: string; readonly exercise: string }) {
  const target = path.join(tasksDirectory, options.exercise);

  await cp(path.join(options.source, "instruction.md"), path.join(target, "prompt.md"));
  await copyEntries({
    source: path.join(options.source, "environment", "workspace"),
    target: path.join(target, "workspace"),
    skipped: hiddenWorkspaceEntries,
  });
  await copyEntries({
    source: path.join(options.source, "tests"),
    target: path.join(target, "tests"),
    skipped: runnerOnlyTestFiles,
  });
  await cp(
    path.join(options.source, "tests", ".meta", "example.py"),
    path.join(target, "reference", "example.py"),
  );
}

async function fetchTasks(): Promise<number> {
  const dataset = await cloneDataset();
  const folders = (await readdir(dataset)).filter((name) => name.startsWith(taskPrefix)).sort();

  if (folders.length !== expectedTaskCount) {
    throw new Error(`Expected ${expectedTaskCount} Python tasks and found ${folders.length}.`);
  }

  await rm(tasksDirectory, { recursive: true, force: true });

  for (const folder of folders) {
    await writeTask({ source: path.join(dataset, folder), exercise: folder.slice(taskPrefix.length) });
  }

  await rm(path.dirname(path.dirname(dataset)), { recursive: true, force: true });

  return folders.length;
}

const count = await fetchTasks();

console.log(`Wrote ${count} tasks from harbor-datasets ${datasetCommit} to ${tasksDirectory}.`);
