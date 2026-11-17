import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RunRecord } from "@agent-evals/records";
import type { Lock } from "./lock";
import { runProcess } from "./process";
import {
  type GraderRequest,
  protocolVersion,
  readGraderResponse,
  readSubjectResponse,
  type SubjectRequest,
} from "./protocol";
import { inheritedEnvironment, type Sandbox } from "./sandbox";
import { buildSchedule, type Cell, cellKey, type TaskBlock } from "./schedule";
import { type Arm, type Experiment, promptOf, type Task } from "./spec";
import {
  appendAttempt,
  type Attempt,
  lastAttempts,
  readAttempts,
  recordsOf,
  type Store,
  storeOf,
  workDirectoryOf,
  workNameOf,
} from "./store";

export type StopReason = "complete" | "run-limit" | "cost-limit" | "look";

export type LookDecision = "continue" | "stop";

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
  readonly onAttempt?: (attempt: Attempt) => void;
  readonly atLook?: (look: {
    readonly tasksDone: number;
    readonly records: readonly RunRecord[];
  }) => LookDecision;
};

type CellContext = {
  readonly experiment: Experiment;
  readonly lock: Lock;
  readonly sandbox: Sandbox;
  readonly store: Store;
  readonly cell: Cell;
  readonly attempt: number;
};

async function copyOverlay(options: {
  readonly experiment: Experiment;
  readonly overlay: Readonly<Record<string, string>>;
  readonly target: string;
}): Promise<void> {
  for (const [destination, source] of Object.entries(options.overlay)) {
    await cp(
      path.join(options.experiment.directory, source),
      path.join(options.target, destination),
      { recursive: true },
    );
  }
}

async function prepareDirectories(options: {
  readonly context: CellContext;
  readonly task: Task;
  readonly arm: Arm;
}): Promise<{ readonly workspace: string; readonly home: string }> {
  const { context, task, arm } = options;
  const root = workDirectoryOf(context);
  const workspace = path.join(root, "workspace");
  const home = path.join(root, "home");

  await mkdir(workspace, { recursive: true });
  await mkdir(home, { recursive: true });

  if (task.workspace !== undefined) {
    await cp(path.join(context.experiment.directory, task.workspace), workspace, {
      recursive: true,
    });
  }

  await copyOverlay({ experiment: context.experiment, overlay: arm.files, target: workspace });
  await copyOverlay({ experiment: context.experiment, overlay: arm.home, target: home });

  return { workspace, home };
}

function resolvedCommand(options: {
  readonly experiment: Experiment;
  readonly command: readonly string[];
}): readonly string[] {
  return options.command.map((argument) =>
    argument.startsWith("./") ? path.join(options.experiment.directory, argument) : argument,
  );
}

function hostEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value]],
    ),
  );
}

async function runCell(context: CellContext): Promise<Attempt> {
  const { experiment, cell, sandbox } = context;
  const base = {
    ...cell,
    attempt: context.attempt,
    subject: path.basename(experiment.subject.command[0] ?? sandbox.name),
    design: context.lock.digest,
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
  const { workspace, home } = await prepareDirectories({ context, task, arm });
  const subjectRequest: SubjectRequest = {
    protocol: protocolVersion,
    kind: "subject",
    task: { id: task.id, prompt },
    arm: { name: cell.arm, flags: arm.flags, model: arm.model },
    workspace,
    home,
    timeoutSeconds: experiment.timeoutSeconds,
  };
  const startedAt = performance.now();
  const subject = readSubjectResponse(
    await sandbox.run({
      command: resolvedCommand({ experiment, command: experiment.subject.command }),
      input: JSON.stringify(subjectRequest),
      workingDirectory: workspace,
      homeDirectory: home,
      environment: {
        ...inheritedEnvironment({ source: process.env, passEnv: experiment.passEnv }),
        ...arm.env,
      },
      timeoutSeconds: experiment.timeoutSeconds,
    }),
  );
  const measured = {
    ...base,
    durationSeconds: (performance.now() - startedAt) / 1000,
    costUsd: subject.costUsd,
    versions: subject.versions,
  };

  if (subject.status === "infra-failure") {
    return { ...measured, status: "infra-failure", scores: {}, detail: subject.detail };
  }

  const graderRequest: GraderRequest = {
    protocol: protocolVersion,
    kind: "grader",
    task: { id: task.id, prompt },
    workspace,
    output: subject.output,
  };
  const grade = readGraderResponse(
    await runProcess({
      command: resolvedCommand({ experiment, command: experiment.grader.command }),
      input: JSON.stringify(graderRequest),
      workingDirectory: experiment.directory,
      environment: hostEnvironment(),
      timeoutSeconds: experiment.timeoutSeconds,
    }),
  );

  return grade.status === "graded"
    ? { ...measured, status: subject.status, scores: { ...grade.scores } }
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
}): Promise<StopReason | null> {
  const { run, store, block, attempts } = options;

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

      const result = await runCell({
        experiment: run.experiment,
        lock: run.lock,
        sandbox: run.sandbox,
        store,
        cell,
        attempt,
      });

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
  const startCount = attempts.length;
  const summaryOf = (options: { reason: StopReason; tasksDone: number }): RunSummary => ({
    ...options,
    newAttempts: attempts.length - startCount,
    records: recordsOf(attempts),
  });
  const blocks = buildSchedule(run.experiment);

  for (const [index, block] of blocks.entries()) {
    const limit = await runBlock({ run, store, block, attempts });
    const tasksDone = index + 1;

    if (limit !== null) {
      return summaryOf({ reason: limit, tasksDone: index });
    }

    const isLook = run.experiment.looks.includes(tasksDone) && tasksDone < blocks.length;

    if (isLook && run.atLook?.({ tasksDone, records: recordsOf(attempts) }) === "stop") {
      return summaryOf({ reason: "look", tasksDone });
    }
  }

  return summaryOf({ reason: "complete", tasksDone: blocks.length });
}
