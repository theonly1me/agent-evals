import { z } from "zod";

export const runStatuses = ["completed", "timeout", "infra-failure"] as const;

export const runRecordSchema = z.object({
  task: z.string().min(1),
  arm: z.string().min(1),
  repeat: z.number().int().nonnegative(),
  status: z.enum(runStatuses),
  scores: z.record(z.string(), z.number()),
  subject: z.string().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  versions: z.record(z.string(), z.string()).optional(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;
export type RunStatus = (typeof runStatuses)[number];

export function isScored(options: { record: RunRecord; metric: string }): boolean {
  return (
    options.record.status !== "infra-failure" && options.record.scores[options.metric] !== undefined
  );
}
