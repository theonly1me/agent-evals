import path from "node:path";
import { z } from "zod";
import type { Experiment } from "./spec";

export const lockFileName = "agent-evals.lock.json";
export const storeDirectoryName = ".agent-evals";
export const significanceLevel = 0.05;

const skippedSegments = [storeDirectoryName, "node_modules", ".git"];

const designSchema = z.record(z.string(), z.unknown());

const lockSchema = z.object({
  version: z.literal(1),
  digest: z.string(),
  design: designSchema,
  files: z.record(z.string(), z.string()),
});

export type Design = z.infer<typeof designSchema>;
export type Lock = z.infer<typeof lockSchema>;

export type LockCheck =
  | { readonly status: "matches"; readonly lock: Lock }
  | { readonly status: "rejected"; readonly problem: string };

function sha256(content: string | ArrayBuffer): string {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex");
}

async function fileDigests(experiment: Experiment): Promise<Record<string, string>> {
  const { directory } = experiment;
  const specName = path.relative(directory, experiment.specFile);
  const files: string[] = [];

  for await (const file of new Bun.Glob("**/*").scan({
    cwd: directory,
    onlyFiles: true,
    dot: true,
  })) {
    const skipped = file.split("/").some((segment) => skippedSegments.includes(segment));

    if (!skipped && file !== lockFileName && file !== specName) {
      files.push(file);
    }
  }

  const digests: Record<string, string> = {};

  for (const file of files.sort()) {
    digests[file] = sha256(await Bun.file(path.join(directory, file)).arrayBuffer());
  }

  return digests;
}

function designOf(experiment: Experiment): Design {
  const { directory, specFile, maxRuns, maxCostUsd, maxJudgeCalls, ...design } = experiment;

  return { ...design, alpha: significanceLevel };
}

export async function buildLock(experiment: Experiment): Promise<Lock> {
  const files = await fileDigests(experiment);
  const design = designOf(experiment);

  return { version: 1, digest: sha256(JSON.stringify({ design, files })), design, files };
}

export async function freezeExperiment(experiment: Experiment): Promise<Lock> {
  const lock = await buildLock(experiment);

  await Bun.write(
    path.join(experiment.directory, lockFileName),
    `${JSON.stringify(lock, null, 2)}\n`,
  );

  return lock;
}

function changedFiles(options: { readonly frozen: Lock; readonly current: Lock }): string[] {
  const names = new Set([
    ...Object.keys(options.frozen.files),
    ...Object.keys(options.current.files),
  ]);

  return [...names]
    .filter((name) => options.frozen.files[name] !== options.current.files[name])
    .sort();
}

export async function checkLock(experiment: Experiment): Promise<LockCheck> {
  const lockFile = Bun.file(path.join(experiment.directory, lockFileName));

  if (!(await lockFile.exists())) {
    return {
      status: "rejected",
      problem: `The experiment is not frozen. Run agent-evals freeze ${experiment.directory} first.`,
    };
  }

  const frozen = lockSchema.safeParse(await lockFile.json());

  if (!frozen.success) {
    return { status: "rejected", problem: `${lockFileName} is not a valid lock. Freeze again.` };
  }

  const current = await buildLock(experiment);

  if (current.digest === frozen.data.digest) {
    return { status: "matches", lock: frozen.data };
  }

  const files = changedFiles({ frozen: frozen.data, current });
  const cause =
    files.length > 0
      ? `These files changed: ${files.join(", ")}.`
      : "The design in the experiment file changed.";

  return {
    status: "rejected",
    problem: `The experiment changed after the freeze. ${cause} To start a new experiment, remove ${storeDirectoryName} and freeze again.`,
  };
}
