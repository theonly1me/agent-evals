import path from "node:path";
import type { RunRecord, RunStatus } from "@agent-evals/records";
import { z } from "zod";
import { rejected, withRepeats, type ImportResult } from "./result";

const trialSchema = z.object({
  task_name: z.string().min(1),
  trial_name: z.string(),
  agent_info: z.object({
    name: z.string(),
    version: z.string(),
    model_info: z.object({ name: z.string() }).nullish(),
  }),
  agent_result: z.object({ cost_usd: z.number().nullish() }).nullish(),
  verifier_result: z.object({ rewards: z.record(z.string(), z.number()).nullish() }).nullish(),
  exception_info: z.object({ exception_type: z.string() }).nullish(),
  reward_valid: z.boolean().optional(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
});

type Trial = z.infer<typeof trialSchema>;

const timeoutPattern = /timeout/i;

function statusOf(options: { readonly trial: Trial; readonly hasRewards: boolean }): RunStatus {
  const { trial, hasRewards } = options;
  const isValid = trial.reward_valid ?? (hasRewards && !trial.exception_info);

  if (!isValid) {
    return "infra-failure";
  }

  return timeoutPattern.test(trial.exception_info?.exception_type ?? "") ? "timeout" : "completed";
}

function durationOf(trial: Trial): number | undefined {
  if (!trial.started_at || !trial.finished_at) {
    return undefined;
  }

  const seconds = (Date.parse(trial.finished_at) - Date.parse(trial.started_at)) / 1000;

  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function runOf(options: {
  readonly trial: Trial;
  readonly arm: string;
}): Omit<RunRecord, "repeat"> {
  const { trial, arm } = options;
  const rewards = trial.verifier_result?.rewards ?? {};
  const status = statusOf({ trial, hasRewards: Object.keys(rewards).length > 0 });
  const model = trial.agent_info.model_info?.name;

  return {
    task: trial.task_name,
    arm,
    status,
    scores: status === "infra-failure" ? {} : rewards,
    subject: trial.agent_info.name,
    durationSeconds: durationOf(trial),
    costUsd: trial.agent_result?.cost_usd ?? undefined,
    versions: {
      agent: `${trial.agent_info.name}@${trial.agent_info.version}`,
      ...(model ? { model } : {}),
    },
  };
}

export async function importHarborJob(options: {
  readonly directory: string;
  readonly arm: string;
}): Promise<ImportResult> {
  const files: string[] = [];

  for await (const file of new Bun.Glob("*/result.json").scan({ cwd: options.directory })) {
    files.push(file);
  }

  if (files.length === 0) {
    return rejected(`${options.directory} has no trial folder with a result.json file.`);
  }

  const trials: Trial[] = [];

  for (const file of files.sort()) {
    const parsed = trialSchema.safeParse(await Bun.file(path.join(options.directory, file)).json());

    if (!parsed.success) {
      return rejected(
        `${path.join(options.directory, file)} is not a Harbor trial result.\n${z.prettifyError(parsed.error)}`,
      );
    }

    trials.push(parsed.data);
  }

  return {
    status: "imported",
    source: "harbor",
    records: withRepeats(trials.map((trial) => runOf({ trial, arm: options.arm }))),
  };
}
