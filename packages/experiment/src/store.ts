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
});

export type Attempt = z.infer<typeof attemptSchema>;

export type Store = {
  readonly directory: string;
  readonly runsFile: string;
};

export function storeOf(experiment: Experiment): Store {
  const directory = path.join(experiment.directory, storeDirectoryName);

  return { directory, runsFile: path.join(directory, "runs.jsonl") };
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

export function recordsOf(attempts: readonly Attempt[]): readonly RunRecord[] {
  return [...lastAttempts(attempts).values()].map((attempt) => runRecordSchema.parse(attempt));
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
