import { stat } from "node:fs/promises";
import path from "node:path";
import { importHarborJob } from "./harbor";
import { importInspectLog } from "./inspect";
import { importJsonl } from "./jsonl";
import { importPromptfooOutput } from "./promptfoo";
import { rejected, type ImportResult } from "./result";

export { type ImportResult, type SourceFormat, sourceFormats } from "./result";

function hasKey(options: { readonly content: unknown; readonly key: string }): boolean {
  return (
    typeof options.content === "object" &&
    options.content !== null &&
    options.key in options.content
  );
}

async function importJsonFile(options: {
  readonly file: string;
  readonly arm: string;
}): Promise<ImportResult> {
  const { file, arm } = options;
  const content: unknown = await Bun.file(file)
    .json()
    .catch(() => undefined);

  if (content === undefined) {
    return rejected(`${file} is not valid JSON.`);
  }

  if (hasKey({ content, key: "samples" })) {
    return importInspectLog({ file, content, arm });
  }

  if (hasKey({ content, key: "results" })) {
    return importPromptfooOutput({ file, content });
  }

  return rejected(
    `${file} is not a known format. Pass an Inspect AI log dump, a promptfoo JSON output, a Harbor job folder, or a JSONL file of run records.`,
  );
}

export function armNameOf(location: string): string {
  return path.basename(location).replace(/\.(jsonl?|eval)$/, "");
}

export async function importRunRecords(options: {
  readonly location: string;
  readonly arm?: string;
}): Promise<ImportResult> {
  const { location } = options;
  const arm = options.arm ?? armNameOf(location);
  const entry = await stat(location).catch(() => undefined);

  if (!entry) {
    return rejected(`${location} does not exist.`);
  }

  if (entry.isDirectory()) {
    return importHarborJob({ directory: location, arm });
  }

  if (location.endsWith(".eval")) {
    return rejected(
      `${location} is a binary Inspect AI log. Run "inspect log dump ${location} > log.json" and pass log.json.`,
    );
  }

  if (location.endsWith(".jsonl")) {
    return importJsonl({ file: location, text: await Bun.file(location).text() });
  }

  return importJsonFile({ file: location, arm });
}
