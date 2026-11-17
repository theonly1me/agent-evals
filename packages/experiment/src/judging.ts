import path from "node:path";
import {
  type AskJudge,
  entryFiles,
  type JudgeEntry,
  type JudgeRequest,
  pairwisePreference,
  rubricPass,
} from "./judge";
import { candidatesOf } from "./looks";
import { protocolVersion } from "./protocol";
import type { TaskBlock } from "./schedule";
import { type Experiment, type Judge, promptOf } from "./spec";
import { appendJudgment, type Attempt, type Judgment, lastAttempts, type Store } from "./store";

export type JudgingContext = {
  readonly experiment: Experiment;
  readonly store: Store;
  readonly ask: AskJudge;
  readonly attempts: readonly Attempt[];
  readonly judgments: Judgment[];
  readonly calls: { count: number };
};

type Scored = { readonly score: number; readonly calls: number } | "failed" | "limit";

const orderCount = 2;

function exists(options: { readonly judgments: readonly Judgment[]; readonly key: Judgment }) {
  const { key } = options;

  return options.judgments.some(
    (judgment) =>
      judgment.metric === key.metric &&
      judgment.task === key.task &&
      judgment.arm === key.arm &&
      judgment.repeat === key.repeat,
  );
}

async function entryOf(options: {
  readonly context: JudgingContext;
  readonly judge: Judge;
  readonly attempt: Attempt;
  readonly label: string;
}): Promise<JudgeEntry> {
  const { context, attempt } = options;
  const workspace = path.join(context.store.directory, "work", attempt.work ?? "", "workspace");

  return {
    label: options.label,
    output: attempt.output ?? "",
    files: await entryFiles({ workspace, include: options.judge.include }),
  };
}

async function askOnce(options: {
  readonly context: JudgingContext;
  readonly judge: Judge;
  readonly request: JudgeRequest;
}): Promise<unknown | "failed" | "limit"> {
  const { context, judge, request } = options;
  const limit = context.experiment.maxJudgeCalls;

  if (limit !== undefined && context.calls.count >= limit) {
    return "limit";
  }

  context.calls.count += 1;
  const answer = await context.ask({
    judge,
    request,
    scratchDirectory: path.join(context.store.directory, "work", `judge-${crypto.randomUUID()}`),
  });

  return answer.status === "answered" ? answer.answer : "failed";
}

function meanOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function scorePair(options: {
  readonly context: JudgingContext;
  readonly judge: Judge;
  readonly task: { readonly id: string; readonly prompt: string };
  readonly baseline: Attempt;
  readonly candidate: Attempt;
}): Promise<Scored> {
  const { context, judge, task } = options;
  const preferences: number[] = [];

  for (let vote = 0; vote < judge.votes; vote += 1) {
    for (const candidateLabel of ["B", "A"] as const) {
      const baselineLabel = candidateLabel === "A" ? "B" : "A";
      const labeled = [
        await entryOf({ context, judge, attempt: options.baseline, label: baselineLabel }),
        await entryOf({ context, judge, attempt: options.candidate, label: candidateLabel }),
      ].sort((left, right) => left.label.localeCompare(right.label));
      const answer = await askOnce({
        context,
        judge,
        request: {
          protocol: protocolVersion,
          kind: "judge",
          mode: "pairwise",
          rubric: judge.rubric,
          task,
          entries: labeled,
        },
      });

      if (answer === "limit" || answer === "failed") {
        return answer;
      }

      const preference = pairwisePreference({ answer, candidateLabel });

      if (preference === null) {
        return "failed";
      }

      preferences.push(preference);
    }
  }

  return { score: meanOf(preferences), calls: preferences.length };
}

async function scoreRubric(options: {
  readonly context: JudgingContext;
  readonly judge: Judge;
  readonly task: { readonly id: string; readonly prompt: string };
  readonly attempt: Attempt;
}): Promise<Scored> {
  const { context, judge, task } = options;
  const passes: number[] = [];

  for (let vote = 0; vote < judge.votes; vote += 1) {
    const answer = await askOnce({
      context,
      judge,
      request: {
        protocol: protocolVersion,
        kind: "judge",
        mode: "rubric",
        rubric: judge.rubric,
        task,
        entries: [await entryOf({ context, judge, attempt: options.attempt, label: "A" })],
      },
    });

    if (answer === "limit" || answer === "failed") {
      return answer;
    }

    const pass = rubricPass(answer);

    if (pass === null) {
      return "failed";
    }

    passes.push(pass);
  }

  return { score: meanOf(passes), calls: passes.length };
}

async function record(options: {
  readonly context: JudgingContext;
  readonly key: Judgment;
  readonly scored: Scored;
}): Promise<"limit" | null> {
  const { context, key, scored } = options;

  if (scored === "limit") {
    return "limit";
  }

  if (scored !== "failed") {
    const judgment = { ...key, score: scored.score, calls: scored.calls };

    await appendJudgment({ store: context.store, judgment });
    context.judgments.push(judgment);
  }

  return null;
}

export async function judgeBlock(options: {
  readonly context: JudgingContext;
  readonly block: TaskBlock;
}): Promise<"limit" | null> {
  const { context, block } = options;
  const { experiment } = context;
  const taskSpec = experiment.tasks.find((task) => task.id === block.task);

  if (taskSpec === undefined || experiment.judges.length === 0) {
    return null;
  }

  const task = { id: taskSpec.id, prompt: await promptOf({ experiment, task: taskSpec }) };
  const finished = [...lastAttempts(context.attempts).values()].filter(
    (attempt) => attempt.task === block.task && attempt.status !== "infra-failure",
  );

  for (const judge of experiment.judges) {
    const base = { kind: judge.kind, metric: judge.metric, task: block.task, score: 0, calls: 0 };

    if (judge.kind === "rubric") {
      for (const attempt of finished) {
        const key = { ...base, arm: attempt.arm, repeat: attempt.repeat, orders: 1 };

        if (!exists({ judgments: context.judgments, key })) {
          const scored = await scoreRubric({ context, judge, task, attempt });

          if ((await record({ context, key, scored })) === "limit") {
            return "limit";
          }
        }
      }

      continue;
    }

    for (const candidate of finished.filter((attempt) =>
      candidatesOf(experiment).includes(attempt.arm),
    )) {
      const baseline = finished.find(
        (attempt) => attempt.arm === experiment.baseline && attempt.repeat === candidate.repeat,
      );
      const key = {
        ...base,
        arm: candidate.arm,
        repeat: candidate.repeat,
        baseline: experiment.baseline,
        orders: orderCount,
      };

      if (baseline !== undefined && !exists({ judgments: context.judgments, key })) {
        const scored = await scorePair({ context, judge, task, baseline, candidate });

        if ((await record({ context, key, scored })) === "limit") {
          return "limit";
        }
      }
    }
  }

  return null;
}
