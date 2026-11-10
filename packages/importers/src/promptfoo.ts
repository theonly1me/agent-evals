import type { RunRecord } from "@agent-evals/records";
import { z } from "zod";
import { rejected, withRepeats, type ImportResult } from "./result";

const errorFailureReason = 2;

const outputSchema = z.object({
  results: z.object({
    results: z.array(
      z.object({
        testIdx: z.number().int(),
        repeatGroupId: z.string().optional(),
        provider: z.object({ id: z.string(), label: z.string().optional() }),
        success: z.boolean(),
        score: z.number(),
        namedScores: z.record(z.string(), z.number()).optional(),
        latencyMs: z.number().nonnegative().optional(),
        cost: z.number().nonnegative().optional(),
        failureReason: z.number().int().optional(),
      }),
    ),
  }),
});

export function importPromptfooOutput(options: {
  readonly file: string;
  readonly content: unknown;
}): ImportResult {
  const parsed = outputSchema.safeParse(options.content);

  if (!parsed.success) {
    return rejected(
      `${options.file} is not a promptfoo JSON output.\n${z.prettifyError(parsed.error)}`,
    );
  }

  const runs: Omit<RunRecord, "repeat">[] = parsed.data.results.results.map((row) => {
    const hasFailed = row.failureReason === errorFailureReason;

    return {
      task: row.repeatGroupId ?? `test-${row.testIdx}`,
      arm: row.provider.label ?? row.provider.id,
      status: hasFailed ? "infra-failure" : "completed",
      scores: hasFailed
        ? {}
        : { ...row.namedScores, score: row.score, success: row.success ? 1 : 0 },
      subject: row.provider.id,
      durationSeconds: row.latencyMs === undefined ? undefined : row.latencyMs / 1000,
      costUsd: row.cost,
    };
  });

  return { status: "imported", source: "promptfoo", records: withRepeats(runs) };
}
