import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { type RunRecord, runRecordSchema } from "@agent-evals/records";
import { z } from "zod";
import { storeDirectoryName } from "./lock";
import { type Cell, cellKey } from "./schedule";
import type { Experiment } from "./spec";

const attemptSchema = runRecordSchema.extend({
  attempt: z.number().int().nonnegative(),
  detail: z.string().optional(),
  work: z.string().optional(),
  output: z.string().optional(),
});

export type Attempt = z.infer<typeof attemptSchema>;

const judgmentSchema = z.object({
  kind: z.enum(["pairwise", "rubric"]),
  metric: z.string(),
  task: z.string(),
  arm: z.string(),
  repeat: z.number().int().nonnegative(),
  baseline: z.string().optional(),
  score: z.number(),
  orders: z.number().int().positive(),
  calls: z.number().int().nonnegative(),
});

export type Judgment = z.infer<typeof judgmentSchema>;

export type Store = {
  readonly directory: string;
  readonly runsFile: string;
  readonly judgmentsFile: string;
};

export const pairwiseBaselineScore = 0.5;

export function storeOf(experiment: Experiment): Store {
  const directory = path.join(experiment.directory, storeDirectoryName);

  return {
    directory,
    runsFile: path.join(directory, "runs.jsonl"),
    judgmentsFile: path.join(directory, "judgments.jsonl"),
  };
}

export async function readAttempts(store: Store): Promise<readonly Attempt[]> {
  const file = Bun.file(store.runsFile);

  if (!(await file.exists())) {
    return [];
  }

  return (await file.text())
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => attemptSchema.parse(JSON.parse(line)));
}

export async function appendAttempt(options: {
  readonly store: Store;
  readonly attempt: Attempt;
}): Promise<void> {
  await mkdir(options.store.directory, { recursive: true });
  await appendFile(options.store.runsFile, `${JSON.stringify(options.attempt)}\n`);
}

export function lastAttempts(attempts: readonly Attempt[]): ReadonlyMap<string, Attempt> {
  const last = new Map<string, Attempt>();

  for (const attempt of attempts) {
    last.set(cellKey(attempt), attempt);
  }

  return last;
}

async function readLines(file: string): Promise<readonly unknown[]> {
  const handle = Bun.file(file);

  if (!(await handle.exists())) {
    return [];
  }

  return (await handle.text())
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export async function readJudgments(store: Store): Promise<readonly Judgment[]> {
  return (await readLines(store.judgmentsFile)).map((line) => judgmentSchema.parse(line));
}

export async function appendJudgment(options: {
  readonly store: Store;
  readonly judgment: Judgment;
}): Promise<void> {
  await mkdir(options.store.directory, { recursive: true });
  await appendFile(options.store.judgmentsFile, `${JSON.stringify(options.judgment)}\n`);
}

function judged(options: {
  readonly record: RunRecord;
  readonly judgments: readonly Judgment[];
}): RunRecord {
  const { record } = options;
  const sameRun = options.judgments.filter(
    (judgment) => judgment.task === record.task && judgment.repeat === record.repeat,
  );
  const own = sameRun.filter((judgment) => judgment.arm === record.arm);
  const asBaseline = sameRun.filter(
    (judgment) => judgment.kind === "pairwise" && judgment.baseline === record.arm,
  );
  const scores = {
    ...record.scores,
    ...Object.fromEntries(asBaseline.map((judgment) => [judgment.metric, pairwiseBaselineScore])),
    ...Object.fromEntries(own.map((judgment) => [judgment.metric, judgment.score])),
  };
  const pairwise = [...own, ...asBaseline].filter((judgment) => judgment.kind === "pairwise");
  const orders = pairwise.map((judgment) => judgment.orders);

  return orders.length === 0
    ? { ...record, scores }
    : { ...record, scores, judgeOrders: Math.min(...orders) };
}

export function recordsOf(options: {
  readonly attempts: readonly Attempt[];
  readonly judgments: readonly Judgment[];
}): readonly RunRecord[] {
  return [...lastAttempts(options.attempts).values()].map((attempt) =>
    judged({ record: runRecordSchema.parse(attempt), judgments: options.judgments }),
  );
}

export function workNameOf(options: { readonly cell: Cell; readonly attempt: number }): string {
  return new Bun.CryptoHasher("sha256")
    .update(`${cellKey(options.cell)}\u0000${options.attempt}`)
    .digest("hex")
    .slice(0, 16);
}

export function workDirectoryOf(options: {
  readonly store: Store;
  readonly cell: Cell;
  readonly attempt: number;
}): string {
  return path.join(options.store.directory, "work", workNameOf(options));
}
