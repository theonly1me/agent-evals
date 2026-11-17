import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type Attempt,
  canaryVariable,
  checkLock,
  dockerProblem,
  dockerSandbox,
  type Experiment,
  freezeExperiment,
  hostSandbox,
  loadExperiment,
  lockFileName,
  probeIsolation,
  type RunSummary,
  runExperiment,
  storeOf,
} from "@agent-evals/experiment";
import { buildReport, renderReport, type ReportFormat, reportFormats } from "@agent-evals/report";
import { defaultComparisonSettings } from "@agent-evals/verdict";
import { type CommandOutcome, failed, succeeded } from "../outcome";
import { templateFiles } from "./template";

export type Progress = (line: string) => void;

export const experimentUsage = `Usage:
  agent-evals init [folder]          Write an example experiment that needs no model.
  agent-evals freeze <experiment>    Record the design and the digest of each input file.
  agent-evals run <experiment>       Run the frozen experiment and give the verdict.

Options for run:
  --format <format>      text (default), markdown, html, or json.
  --output <file>        Write the report to a file.
`;

const defaultFolder = "agent-evals-example";
const shownDigestLength = 12;

async function isEmptyOrMissing(directory: string): Promise<boolean> {
  try {
    return (await readdir(directory)).length === 0;
  } catch {
    return true;
  }
}

export async function runInit(argumentList: readonly string[]): Promise<CommandOutcome> {
  const [folder = defaultFolder, ...extra] = argumentList;

  if (extra.length > 0) {
    return failed(`Pass one folder.\n\n${experimentUsage}`);
  }

  if (!(await isEmptyOrMissing(folder))) {
    return failed(`${folder} is not empty. Name a new folder.`);
  }

  for (const [file, text] of Object.entries(templateFiles)) {
    await Bun.write(path.join(folder, file), text);
  }

  return succeeded(
    `Wrote an example experiment to ${folder}.\n\nNext:\n  agent-evals freeze ${folder}\n  agent-evals run ${folder}\n`,
  );
}

async function loadFrom(
  argumentList: readonly string[],
): Promise<{ readonly experiment: Experiment } | { readonly problem: string }> {
  const [location, ...extra] = argumentList;

  if (location === undefined || extra.length > 0) {
    return { problem: `Pass one experiment folder.\n\n${experimentUsage}` };
  }

  const loaded = await loadExperiment(location);

  return loaded.status === "loaded"
    ? { experiment: loaded.experiment }
    : { problem: loaded.problem };
}

export async function runFreeze(argumentList: readonly string[]): Promise<CommandOutcome> {
  const loaded = await loadFrom(argumentList);

  if ("problem" in loaded) {
    return failed(loaded.problem);
  }

  const lock = await freezeExperiment(loaded.experiment);
  const fileCount = Object.keys(lock.files).length;

  return succeeded(
    `Froze ${loaded.experiment.name}: design ${lock.digest.slice(0, shownDigestLength)}, ${fileCount} input files. Wrote ${lockFileName}.\n`,
  );
}

function progressLine(options: {
  readonly attempt: Attempt;
  readonly count: number;
  readonly total: number;
}): string {
  const { attempt } = options;
  const scores = Object.entries(attempt.scores)
    .map(([name, value]) => `${name}=${value}`)
    .join(" ");
  const retry = attempt.attempt > 0 ? ` retry ${attempt.attempt}` : "";

  return `[${options.count} of ${options.total}] ${attempt.task} ${attempt.arm} repeat ${attempt.repeat}${retry}: ${attempt.status} ${scores}`.trimEnd();
}

function stopNote(options: {
  readonly summary: RunSummary;
  readonly experiment: Experiment;
}): string {
  const { summary, experiment } = options;
  const taskCount = experiment.tasks.length;
  const notes = {
    complete: `All ${taskCount} tasks are complete.`,
    "run-limit": `Stopped at the limit of ${experiment.maxRuns} runs, after ${summary.tasksDone} of ${taskCount} tasks. Raise maxRuns and run again to continue.`,
    "cost-limit": `Stopped at the cost limit of ${experiment.maxCostUsd} USD, after ${summary.tasksDone} of ${taskCount} tasks. Raise maxCostUsd and run again to continue.`,
    look: `Stopped at the look after ${summary.tasksDone} of ${taskCount} tasks.`,
  };

  return notes[summary.reason];
}

function parseRunArguments(argumentList: readonly string[]) {
  try {
    const { values, positionals } = parseArgs({
      args: [...argumentList],
      allowPositionals: true,
      options: { format: { type: "string" }, output: { type: "string" } },
    });
    const format = reportFormats.find((candidate) => candidate === (values.format ?? "text"));

    return format === undefined
      ? { problem: `--format must be one of: ${reportFormats.join(", ")}.` }
      : { positionals, format, output: values.output };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
}

function reportsOf(options: {
  readonly experiment: Experiment;
  readonly summary: RunSummary;
  readonly format: ReportFormat;
}): readonly string[] {
  const { experiment, summary } = options;
  const candidates = Object.keys(experiment.arms).filter((arm) => arm !== experiment.baseline);

  return candidates.map((candidate) => {
    const report = buildReport({
      records: summary.records,
      arms: { baseline: experiment.baseline, candidate },
      metric: experiment.metric,
      settings: { ...defaultComparisonSettings, higherIsBetter: !experiment.lowerIsBetter },
    });

    return report === "no-shared-task"
      ? `No task has a "${experiment.metric}" score in both ${experiment.baseline} and ${candidate}.\n`
      : renderReport({ report, format: options.format });
  });
}

async function withCanary<Result>(options: {
  readonly token: string;
  readonly run: () => Promise<Result>;
}): Promise<Result> {
  process.env[canaryVariable] = options.token;

  try {
    return await options.run();
  } finally {
    delete process.env[canaryVariable];
  }
}

export async function runRun(options: {
  readonly argumentList: readonly string[];
  readonly onProgress: Progress;
}): Promise<CommandOutcome> {
  const parsed = parseRunArguments(options.argumentList);

  if ("problem" in parsed) {
    return failed(`${parsed.problem}\n\n${experimentUsage}`);
  }

  const loaded = await loadFrom(parsed.positionals);

  if ("problem" in loaded) {
    return failed(loaded.problem);
  }

  const { experiment } = loaded;
  const lockCheck = await checkLock(experiment);

  if (lockCheck.status === "rejected") {
    return failed(lockCheck.problem);
  }

  const sandbox = experiment.sandbox === "docker" ? dockerSandbox : hostSandbox;
  const sandboxProblem = experiment.sandbox === "docker" ? await dockerProblem() : null;

  if (sandboxProblem !== null) {
    return failed(sandboxProblem);
  }

  const probe = await probeIsolation({ sandbox, experiment, store: storeOf(experiment) });

  if (probe.status !== "isolated") {
    return failed(probe.problem);
  }

  options.onProgress(`The isolation probe passed for the ${sandbox.name} sandbox.`);

  const total = experiment.tasks.length * Object.keys(experiment.arms).length * experiment.repeats;
  let count = 0;
  const summary = await withCanary({
    token: probe.token,
    run: () =>
      runExperiment({
        experiment,
        lock: lockCheck.lock,
        sandbox,
        canaryToken: probe.token,
        onAttempt: (attempt) => {
          count += attempt.attempt === 0 ? 1 : 0;
          options.onProgress(progressLine({ attempt, count, total }));
        },
      }),
  });
  const note = stopNote({ summary, experiment });
  const reports = reportsOf({ experiment, summary, format: parsed.format });

  if (parsed.output === undefined) {
    return succeeded(
      parsed.format === "text" ? `${note}\n\n${reports.join("\n")}` : reports.join("\n"),
    );
  }

  await Bun.write(parsed.output, reports.join("\n"));

  return succeeded(`${note}\n\nWrote ${parsed.output}\n`);
}
