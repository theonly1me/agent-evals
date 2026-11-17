import { cp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RunRecord } from "@agent-evals/records";
import { canaryVariable } from "./canary";
import { type AskJudge, askJudgeFor } from "./judge";
import { judgeBlock } from "./judging";
import type { Lock } from "./lock";
import type { LookDecision } from "./looks";
import { runProcess } from "./process";
import {
  type GraderRequest,
  protocolVersion,
  readGraderResponse,
  type SubjectRequest,
} from "./protocol";
import { namedEnvironment, type RunPaths, type Sandbox } from "./sandbox";
import { buildSchedule, type Cell, cellKey, type TaskBlock } from "./schedule";
import { type Arm, type Experiment, promptOf, type Task } from "./spec";
import {
  appendAttempt,
  type Attempt,
  type Judgment,
  lastAttempts,
  readAttempts,
  readJudgments,
  recordsOf,
  type Store,
  storeOf,
  workDirectoryOf,
  workNameOf,
} from "./store";
import { subjectProgram } from "./subjects";

export type StopReason = "complete" | "run-limit" | "cost-limit" | "judge-limit" | "look";

export type RunSummary = {
  readonly reason: StopReason;
  readonly newAttempts: number;
  readonly tasksDone: number;
  readonly records: readonly RunRecord[];
};

export type RunOptions = {
  readonly experiment: Experiment;
  readonly lock: Lock;
  readonly sandbox: Sandbox;
  readonly canaryToken?: string;
  readonly realHome?: string;
  readonly askJudge?: AskJudge;
  readonly onAttempt?: (attempt: Attempt) => void;
  readonly atLook?: (look: {
    readonly tasksDone: number;
    readonly records: readonly RunRecord[];
  }) => LookDecision;
};

type CellContext = {
  readonly run: RunOptions;
  readonly store: Store;
  readonly cell: Cell;
  readonly attempt: number;
  readonly versions: VersionReader;
};

type VersionReader = (options: {
  readonly command: readonly string[] | null;
  readonly label: string;
  readonly paths: RunPaths;
  readonly image: string | undefined;
}) => Promise<Readonly<Record<string, string>> | undefined>;

const versionSeconds = 60;
const storedOutputLimit = 20_000;

function sourceOf(options: { readonly source: string; readonly realHome: string }): string {
  return options.source.startsWith("~/")
    ? path.join(options.realHome, options.source.slice(2))
    : options.source;
}

async function copyOverlay(options: {
  readonly sourceRoot: string;
  readonly overlay: Readonly<Record<string, string>>;
  readonly target: string;
  readonly realHome: string;
}): Promise<void> {
  for (const [destination, source] of Object.entries(options.overlay)) {
    await cp(
      path.resolve(options.sourceRoot, sourceOf({ source, realHome: options.realHome })),
      path.join(options.target, destination),
      { recursive: true },
    );
  }
}

async function prepareDirectories(options: {
  readonly context: CellContext;
  readonly task: Task;
  readonly arm: Arm;
}): Promise<RunPaths> {
  const { context, task, arm } = options;
  const { experiment } = context.run;
  const root = workDirectoryOf(context);
  const workspace = path.join(root, "workspace");
  const home = path.join(root, "home");
  const shared = {
    sourceRoot: experiment.directory,
    realHome: context.run.realHome ?? os.homedir(),
  };

  await mkdir(workspace, { recursive: true });
  await mkdir(home, { recursive: true });

  if (task.workspace !== undefined) {
    await cp(path.join(experiment.directory, task.workspace), workspace, { recursive: true });
  }

  await copyOverlay({ ...shared, overlay: arm.files, target: workspace });
  await copyOverlay({ ...shared, overlay: experiment.auth.files, target: home });
  await copyOverlay({ ...shared, overlay: arm.home, target: home });

  return { workspace, home, experiment: experiment.directory };
}

function hostEnvironment(): Record<string, string> {
  return namedEnvironment({ source: process.env, names: Object.keys(process.env) });
}

function resolvedOnHost(options: {
  readonly experiment: Experiment;
  readonly command: readonly string[];
}): readonly string[] {
  return options.command.map((argument) =>
    argument.startsWith("./") ? path.join(options.experiment.directory, argument) : argument,
  );
}

function versionReader(sandbox: Sandbox): VersionReader {
  const known = new Map<string, Readonly<Record<string, string>> | undefined>();

  return async ({ command, label, paths, image }) => {
    const key = `${label}\u0000${image ?? ""}`;

    if (command === null || known.has(key)) {
      return known.get(key);
    }

    const result = await sandbox.run({
      name: `agent-evals-version-${crypto.randomUUID().slice(0, 8)}`,
      command,
      input: "",
      paths,
      environment: {},
      timeoutSeconds: versionSeconds,
      image,
    });
    const versions =
      result.status === "exited" && result.exitCode === 0
        ? { [label]: result.stdout.trim().split("\n")[0] ?? "" }
        : undefined;

    known.set(key, versions);

    return versions;
  };
}

async function runCell(context: CellContext): Promise<Attempt> {
  const { run, cell } = context;
  const { experiment, sandbox } = run;
  const base = {
    ...cell,
    attempt: context.attempt,
    design: run.lock.digest,
    isolation: sandbox.isolation,
    work: workNameOf(context),
  };
  const task = experiment.tasks.find((candidate) => candidate.id === cell.task);
  const arm = experiment.arms[cell.arm];

  if (task === undefined || arm === undefined) {
    return {
      ...base,
      status: "infra-failure",
      scores: {},
      detail: "the cell is not in the experiment",
    };
  }

  const prompt = await promptOf({ experiment, task });
  const paths = await prepareDirectories({ context, task, arm });
  const located = sandbox.locate(paths);
  const image = arm.image ?? experiment.image;
  const subjectRequest: SubjectRequest = {
    protocol: protocolVersion,
    kind: "subject",
    task: { id: task.id, prompt },
    arm: { name: cell.arm, flags: arm.flags, model: arm.model },
    workspace: located.workspace,
    home: located.home,
    timeoutSeconds: experiment.timeoutSeconds,
  };
  const program = subjectProgram({
    experiment,
    request: subjectRequest,
    experimentDirectory: located.experiment,
  });
  const agentVersions = await context.versions({
    command: program.versionCommand,
    label: program.label,
    paths,
    image,
  });
  const startedAt = performance.now();
  const subject = program.read(
    await sandbox.run({
      name: `agent-evals-${base.work}`,
      command: program.command,
      input: program.input,
      paths,
      environment: {
        ...namedEnvironment({ source: process.env, names: experiment.passEnv }),
        ...arm.env,
      },
      timeoutSeconds: experiment.timeoutSeconds,
      image,
    }),
  );
  const versions = { ...agentVersions, ...subject.versions };
  const measured = {
    ...base,
    subject: program.label,
    durationSeconds: (performance.now() - startedAt) / 1000,
    costUsd: subject.costUsd,
    versions: Object.keys(versions).length > 0 ? versions : undefined,
  };

  if (subject.status === "infra-failure") {
    return { ...measured, status: "infra-failure", scores: {}, detail: subject.detail };
  }

  if (run.canaryToken !== undefined && subject.output.includes(run.canaryToken)) {
    return {
      ...measured,
      status: "infra-failure",
      scores: {},
      detail: `the subject read ${canaryVariable} of the runner`,
    };
  }

  const finished = { ...measured, output: subject.output.slice(0, storedOutputLimit) };

  if (experiment.grader === undefined) {
    return { ...finished, status: subject.status, scores: {} };
  }

  const graderRequest: GraderRequest = {
    protocol: protocolVersion,
    kind: "grader",
    task: { id: task.id, prompt },
    workspace: paths.workspace,
    output: subject.output,
  };
  const grade = readGraderResponse(
    await runProcess({
      command: resolvedOnHost({ experiment, command: experiment.grader.command }),
      input: JSON.stringify(graderRequest),
      workingDirectory: experiment.directory,
      environment: hostEnvironment(),
      timeoutSeconds: experiment.timeoutSeconds,
    }),
  );

  return grade.status === "graded"
    ? { ...finished, status: subject.status, scores: { ...grade.scores } }
    : { ...measured, status: "infra-failure", scores: {}, detail: grade.detail };
}

function nextAttemptOf(options: {
  readonly last: Attempt | undefined;
  readonly retries: number;
}): number | null {
  const { last, retries } = options;

  if (last === undefined) {
    return 0;
  }

  return last.status === "infra-failure" && last.attempt < retries ? last.attempt + 1 : null;
}

function limitReached(options: {
  readonly experiment: Experiment;
  readonly attempts: readonly Attempt[];
}): StopReason | null {
  const { experiment, attempts } = options;
  const cost = attempts.reduce((total, attempt) => total + (attempt.costUsd ?? 0), 0);

  if (experiment.maxRuns !== undefined && attempts.length >= experiment.maxRuns) {
    return "run-limit";
  }

  return experiment.maxCostUsd !== undefined && cost >= experiment.maxCostUsd ? "cost-limit" : null;
}

async function runBlock(options: {
  readonly run: RunOptions;
  readonly store: Store;
  readonly block: TaskBlock;
  readonly attempts: Attempt[];
  readonly versions: VersionReader;
}): Promise<StopReason | null> {
  const { run, store, block, attempts, versions } = options;

  for (const cell of block.cells) {
    let attempt = nextAttemptOf({
      last: lastAttempts(attempts).get(cellKey(cell)),
      retries: run.experiment.retries,
    });

    while (attempt !== null) {
      const limit = limitReached({ experiment: run.experiment, attempts });

      if (limit !== null) {
        return limit;
      }

      const result = await runCell({ run, store, cell, attempt, versions });

      await appendAttempt({ store, attempt: result });
      attempts.push(result);
      run.onAttempt?.(result);
      attempt = nextAttemptOf({ last: result, retries: run.experiment.retries });
    }
  }

  return null;
}

export async function runExperiment(run: RunOptions): Promise<RunSummary> {
  const store = storeOf(run.experiment);
  const attempts = [...(await readAttempts(store))];
  const judgments: Judgment[] = [...(await readJudgments(store))];
  const judging = {
    experiment: run.experiment,
    store,
    ask: run.askJudge ?? askJudgeFor(run.experiment),
    attempts,
    judgments,
    calls: { count: judgments.reduce((total, judgment) => total + judgment.calls, 0) },
  };
  const startCount = attempts.length;
  const versions = versionReader(run.sandbox);
  const summaryOf = (options: { reason: StopReason; tasksDone: number }): RunSummary => ({
    ...options,
    newAttempts: attempts.length - startCount,
    records: recordsOf({ attempts, judgments }),
  });
  const blocks = buildSchedule(run.experiment);

  for (const [index, block] of blocks.entries()) {
    const limit = await runBlock({ run, store, block, attempts, versions });
    const tasksDone = index + 1;

    if (limit !== null) {
      return summaryOf({ reason: limit, tasksDone: index });
    }

    if ((await judgeBlock({ context: judging, block })) === "limit") {
      return summaryOf({ reason: "judge-limit", tasksDone: index });
    }

    const isLook = run.experiment.looks.includes(tasksDone) && tasksDone < blocks.length;

    if (
      isLook &&
      run.atLook?.({ tasksDone, records: recordsOf({ attempts, judgments }) }) === "stop"
    ) {
      return summaryOf({ reason: "look", tasksDone });
    }
  }

  return summaryOf({ reason: "complete", tasksDone: blocks.length });
}
