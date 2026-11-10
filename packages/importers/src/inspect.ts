import type { RunRecord } from "@agent-evals/records";
import { z } from "zod";
import { rejected, type ImportResult } from "./result";

const logSchema = z.object({
  eval: z.object({ task: z.string().min(1), model: z.string() }),
  samples: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      epoch: z.number().int().min(1),
      scores: z.record(z.string(), z.object({ value: z.unknown() })).nullish(),
      total_time: z.number().nullish(),
      error: z.unknown().optional(),
    }),
  ),
});

type Sample = z.infer<typeof logSchema>["samples"][number];

const letterGrades: Readonly<Record<string, number>> = {
  C: 1,
  P: 0.5,
  I: 0,
  N: 0,
};

function numericScore(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return typeof value === "string" ? letterGrades[value] : undefined;
}

function scoresOf(sample: Sample): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const [scorer, score] of Object.entries(sample.scores ?? {})) {
    const value = numericScore(score.value);

    if (value !== undefined) {
      scores[scorer] = value;
    }
  }

  return scores;
}

export function importInspectLog(options: {
  readonly file: string;
  readonly content: unknown;
  readonly arm: string;
}): ImportResult {
  const parsed = logSchema.safeParse(options.content);

  if (!parsed.success) {
    return rejected(
      `${options.file} is not an Inspect AI log dump.\n${z.prettifyError(parsed.error)}`,
    );
  }

  const log = parsed.data;
  const records: RunRecord[] = log.samples.map((sample) => {
    const hasFailed = sample.error !== undefined && sample.error !== null;

    return {
      task: `${log.eval.task}/${sample.id}`,
      arm: options.arm,
      repeat: sample.epoch - 1,
      status: hasFailed ? "infra-failure" : "completed",
      scores: hasFailed ? {} : scoresOf(sample),
      subject: log.eval.model,
      durationSeconds: sample.total_time ?? undefined,
      versions: { model: log.eval.model },
    };
  });

  return { status: "imported", source: "inspect", records };
}
