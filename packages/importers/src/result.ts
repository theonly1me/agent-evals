import type { RunRecord } from "@agent-evals/records";

export const sourceFormats = ["jsonl", "harbor", "inspect", "promptfoo"] as const;
export type SourceFormat = (typeof sourceFormats)[number];

export type ImportResult =
  | {
      readonly status: "imported";
      readonly source: SourceFormat;
      readonly records: readonly RunRecord[];
    }
  | { readonly status: "rejected"; readonly problem: string };

export function rejected(problem: string): ImportResult {
  return { status: "rejected", problem };
}

export function withRepeats(runs: readonly Omit<RunRecord, "repeat">[]): readonly RunRecord[] {
  const seenByCell = new Map<string, number>();

  return runs.map((run) => {
    const cell = JSON.stringify([run.arm, run.task]);
    const repeat = seenByCell.get(cell) ?? 0;

    seenByCell.set(cell, repeat + 1);

    return { ...run, repeat };
  });
}
