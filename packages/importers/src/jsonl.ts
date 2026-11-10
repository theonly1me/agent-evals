import { runRecordSchema, type RunRecord } from "@agent-evals/records";
import { z } from "zod";
import { rejected, type ImportResult } from "./result";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function importJsonl(options: {
  readonly file: string;
  readonly text: string;
}): ImportResult {
  const records: RunRecord[] = [];

  for (const [lineIndex, line] of options.text.split("\n").entries()) {
    if (line.trim() === "") {
      continue;
    }

    const parsed = runRecordSchema.safeParse(parseJson(line));

    if (!parsed.success) {
      return rejected(
        `${options.file}:${lineIndex + 1} is not a run record.\n${z.prettifyError(parsed.error)}`,
      );
    }

    records.push(parsed.data);
  }

  return { status: "imported", source: "jsonl", records };
}
